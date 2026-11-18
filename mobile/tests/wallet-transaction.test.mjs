import test from 'node:test';
import assert from 'node:assert/strict';
import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import { serializeForWallet, transactionForSigning } from '../src/wallet-transaction.ts';

test('purchase payment crosses the wallet boundary before sender and coin resolution', async () => {
  const tx = new Transaction();
  tx.moveCall({ target: '0x1::marketplace::purchase', arguments: [coinWithBalance({ type: '0x1::mock_usd::MOCK_USD', balance: 101000000n, useGasCoin: false }), tx.pure.u64(1000000n)] });
  const json = await serializeForWallet(tx);
  const signing = transactionForSigning(json);
  signing.setSenderIfNotSet('0x2');
  let requests = 0;
  const client = { core: {
    getBalance: async () => ({ balance: { balance: '250000000', coinBalance: '250000000', addressBalance: '0' } }),
    listCoins: async () => { requests++; return { objects: [{ objectId: '0x3', version: '1', digest: '11111111111111111111111111111111', balance: '250000000' }], hasNextPage: false, cursor: null }; },
  } };
  const resolved = JSON.parse(await signing.toJSON({ client }));
  assert.equal(resolved.sender, '0x' + '2'.padStart(64, '0'));
  assert.ok(requests > 0, 'coin resolution runs after the sender is provided');
  assert.ok(resolved.commands.every(command => !command.$Intent));
  assert.ok(resolved.commands.some(command => command.MoveCall?.function === 'purchase'));
});
