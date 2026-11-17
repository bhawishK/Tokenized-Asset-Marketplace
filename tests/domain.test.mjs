import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUnits, formatUnits, costOf, purchaseIssue, verifySettlement, assetDelta, validAddress, UNIT, U64_MAX } from '../src/domain.ts';

test('decimal amounts convert exactly to integer units, including one micro-unit', () => {
  assert.equal(parseUnits('0.000001'), 1n);
  assert.equal(parseUnits('1.25'), 1_250_000n);
  assert.equal(parseUnits('100'), 100_000_000n);
  assert.equal(parseUnits('18446744073709.551615'), U64_MAX);
});
test('amount input rejects precision loss, exponential notation and invalid ranges', () => {
  for (const value of ['0', '-1', '1e6', '1.0000001', '1,000', 'NaN', '', ' 1', '.1', '01', '18446744073709.551616']) assert.throws(() => parseUnits(value), undefined, value);
});
test('human readable units never use floating point', () => {
  assert.equal(formatUnits(1n), '0.000001');
  assert.equal(formatUnits(1_250_000n), '1.25');
  assert.equal(formatUnits(-100_000_000n), '−100');
  assert.equal(formatUnits(1_000_000_000n), '1,000');
});
test('fixed price is exact for fractional gold and guards multiplication overflow', () => {
  assert.equal(costOf(UNIT, 100n), 100n * UNIT);
  assert.equal(costOf(1n, 100n), 100n);
  assert.throws(() => costOf(U64_MAX, 100n));
  assert.throws(() => costOf(0n, 100n));
});
test('insufficient funds and inventory stop the ordinary UI path', () => {
  assert.match(purchaseIssue(3n * UNIT, 100n, 250n * UNIT, 100n * UNIT), /Insufficient MockUSD/);
  assert.match(purchaseIssue(2n * UNIT, 100n, 250n * UNIT, UNIT), /inventory/);
  assert.equal(purchaseIssue(UNIT, 100n, 100n * UNIT, UNIT), null);
});
const buyer = '0x' + 'b'.repeat(64), seller = '0x' + 'a'.repeat(64);
const usd = '0xabc::mock_usd::MOCK_USD', gold = '0xabc::demo_gold::DEMO_GOLD';
const settled = [
  { address: buyer, coinType: usd, amount: '-100000000' },
  { address: seller, coinType: usd, amount: '100000000' },
  { address: buyer, coinType: gold, amount: '1000000' },
  { address: buyer, coinType: '0x2::sui::SUI', amount: '-900000' },
];
test('receipt matches buyer payment, proceeds and delivery while ignoring separate SUI gas', () => {
  assert.equal(verifySettlement(settled, buyer, seller, usd, gold, UNIT, 100n * UNIT), true);
});
test('receipt refuses missing delivery, redirected payment and incorrect amounts', () => {
  assert.equal(verifySettlement(settled.slice(0, 2), buyer, seller, usd, gold, UNIT, 100n * UNIT), false);
  assert.equal(verifySettlement(settled, buyer, '0xwrong', usd, gold, UNIT, 100n * UNIT), false);
  assert.equal(verifySettlement(settled, buyer, seller, usd, gold, 2n * UNIT, 100n * UNIT), false);
  assert.equal(verifySettlement(settled, buyer, seller, usd, gold, UNIT, 99n * UNIT), false);
});
test('receipt aggregates multiple changes for the same owner and asset', () => {
  const changes = [{ address: buyer, coinType: usd, amount: '-101000000' }, { address: buyer, coinType: usd, amount: '1000000' }];
  assert.equal(assetDelta(changes, buyer, usd), -100n * UNIT);
});
test('self purchases cannot be presented as proof of distinct party settlement', () => {
  assert.equal(verifySettlement(settled, buyer, buyer, usd, gold, UNIT, 100n * UNIT), false);
});
test('transfer recipient rejects placeholders, zero addresses and truncated addresses', () => {
  assert.equal(validAddress(buyer), true);
  assert.equal(validAddress('0x' + '0'.repeat(64)), false);
  assert.equal(validAddress('0x123'), false);
  assert.equal(validAddress('0xYOUR_BUYER'), false);
});
