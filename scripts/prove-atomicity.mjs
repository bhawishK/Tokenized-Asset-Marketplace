/** Read-only Testnet proof. Never imports a key or submits a transaction. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { bcs } from '@mysten/sui/bcs';
import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { verifySettlement, validAddress, parseUnits, costOf } from '../src/domain.ts';

const { values } = parseArgs({ options: { buyer: { type: 'string' }, success: { type: 'string' }, quantity: { type: 'string', default: '3' } } });
for (const [name, value] of Object.entries({ VITE_PACKAGE_ID: process.env.VITE_PACKAGE_ID, VITE_MARKETPLACE_ID: process.env.VITE_MARKETPLACE_ID, buyer: values.buyer })) {
  if (!value || !validAddress(value)) throw new Error(`Set a real Testnet ${name}; placeholders are not accepted.`);
}
const pkg = normalizeSuiAddress(process.env.VITE_PACKAGE_ID);
const marketId = normalizeSuiAddress(process.env.VITE_MARKETPLACE_ID);
const buyer = normalizeSuiAddress(values.buyer);
const usd = `${pkg}::mock_usd::MOCK_USD`, gold = `${pkg}::demo_gold::DEMO_GOLD`;
const client = new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://fullnode.testnet.sui.io:443' });
const Market = bcs.struct('Marketplace', { id: bcs.Address, inventory: bcs.u64(), price: bcs.u64(), proceeds: bcs.Address });
const Purchase = bcs.struct('Purchase', { marketplace: bcs.Address, buyer: bcs.Address, quantity: bcs.u64(), amount_paid: bcs.u64() });
async function readMarket() {
  const { object } = await client.getObject({ objectId: marketId, include: { content: true } });
  assert.equal(object.type, `${pkg}::marketplace::Marketplace`);
  assert.equal(object.owner.$kind, 'Shared');
  return Market.parse(object.content);
}
const market = await readMarket();
assert.equal(BigInt(market.price), 100n);
assert.notEqual(buyer, market.proceeds, 'Use distinct buyer and seller accounts.');
async function snapshot() {
  const [m, bu, bg, su, sg] = await Promise.all([
    readMarket(), client.getBalance({ owner: buyer, coinType: usd }), client.getBalance({ owner: buyer, coinType: gold }),
    client.getBalance({ owner: market.proceeds, coinType: usd }), client.getBalance({ owner: market.proceeds, coinType: gold }),
  ]);
  return { buyerMockUSD: bu.balance.balance, buyerDemoGold: bg.balance.balance, sellerMockUSD: su.balance.balance, sellerDemoGold: sg.balance.balance, inventory: m.inventory };
}
let success = null;
if (values.success) {
  const result = await client.waitForTransaction({ digest: values.success, include: { effects: true, balanceChanges: true, events: true } });
  assert.ok(result.Transaction, 'The provided purchase must have succeeded.');
  const t = result.Transaction;
  const event = t.events.find(e => e.eventType === `${pkg}::marketplace::Purchase`);
  assert.ok(event, 'No Purchase event from the configured package.');
  const p = Purchase.parse(event.bcs);
  assert.equal(p.marketplace, marketId);
  assert.equal(p.buyer, buyer);
  assert.equal(BigInt(p.amount_paid), costOf(BigInt(p.quantity), BigInt(market.price)));
  assert.ok(verifySettlement(t.balanceChanges, buyer, market.proceeds, usd, gold, BigInt(p.quantity), BigInt(p.amount_paid)), 'Confirmed effects must show payment, proceeds and delivery.');
  success = { digest: t.digest, quantity: p.quantity, amountPaid: p.amount_paid, balanceChanges: t.balanceChanges, effects: t.effects,
    explorer: `https://suivision.xyz/txblock/${t.digest}?network=testnet`, source: 'confirmed Testnet transaction' };
}
const before = await snapshot();
const quantity = parseUnits(values.quantity);
assert.ok(BigInt(before.inventory) >= quantity, 'Use an underpaid quantity within available inventory.');
const cost = costOf(quantity, BigInt(market.price));
// Supply a valid coin that exists, but whose amount is strictly less than cost.
const available = BigInt(before.buyerMockUSD);
assert.ok(available > 0n, 'Fund the buyer with MockUSD before running this proof.');
const underpayment = available < cost ? available : cost - 1n;
const tx = new Transaction();
tx.setSender(buyer);
tx.setGasBudget(100_000_000);
tx.moveCall({ target: `${pkg}::marketplace::purchase`, arguments: [tx.object(marketId), coinWithBalance({ type: usd, balance: underpayment, useGasCoin: false }), tx.pure.u64(quantity)] });
const dryRun = await client.simulateTransaction({ transaction: tx, include: { effects: true, balanceChanges: true }, checksEnabled: true });
assert.ok(dryRun.FailedTransaction, 'Underpayment unexpectedly succeeded.');
const failed = dryRun.FailedTransaction;
const error = failed.status.error;
assert.equal(error?.$kind, 'MoveAbort', 'Must reach contract validation, not fail coin selection or gas.');
assert.equal(error.MoveAbort.abortCode, '1', 'Must abort with EPayment.');
assert.equal(normalizeSuiAddress(error.MoveAbort.location?.package ?? '0x0'), pkg);
assert.equal(error.MoveAbort.location?.module, 'marketplace');
assert.ok(failed.balanceChanges.filter(c => c.coinType === usd || c.coinType === gold).every(c => BigInt(c.amount) === 0n), 'Failed simulation must not report either asset moving.');
const after = await snapshot();
assert.deepEqual(after, before, 'Actual buyer, seller and marketplace balances must remain unchanged. Run with idle dedicated demo accounts.');
const proof = { network: 'testnet', packageId: pkg, marketplaceId: marketId, buyer, proceeds: market.proceeds,
  recordedAt: new Date().toISOString(), success,
  failure: { method: 'read-only Sui Testnet dry run', submitted: false, quantity: quantity.toString(), payment: underpayment.toString(), error, before, after, unchanged: true,
    gasPaymentMocked: dryRun.gasPaymentMocked, note: 'Dry run only; no transaction submitted and no gas charged. A submitted abort may charge SUI gas.' } };
await mkdir('proofs', { recursive: true });
await writeFile('proofs/atomicity.json', JSON.stringify(proof, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2) + '\n');
console.log(success ? `Verified atomic settlement: ${success.digest}` : 'No success digest supplied; only failure behavior was verified.');
console.log('Verified EPayment dry run and unchanged buyer/seller assets + marketplace inventory. Proof: proofs/atomicity.json');
