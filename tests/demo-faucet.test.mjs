import test from 'node:test';
import assert from 'node:assert/strict';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { createDemoFaucet, prepareDemoInventory, CLAIM_AMOUNT } from '../scripts/demo-faucet-core.mjs';

const origin = 'http://localhost:8081';
const deployment = { packageId: '0x' + '1'.repeat(64), marketplaceId: '0x' + '2'.repeat(64), issuerAddress: '0x' + 'a'.repeat(64) };
function setup(options = {}) {
  let state = { claims: {} }, clock = 1000000000000;
  const calls = [];
  const store = { load: async () => structuredClone(state), save: async value => { state = structuredClone(value); } };
  const config = {
    deployment, store, now: () => clock, preflight: async () => {},
    verifySignature: (bytes, signature, address) => verifyPersonalMessageSignature(bytes, signature, { address }),
    fundBuyer: async (address, amount) => { calls.push({ address, amount }); return { digest: 'confirmed-test-digest', gasRequested: true }; },
    ...options,
  };
  return { faucet: createDemoFaucet(config), config, calls, state: () => state, advance: ms => { clock += ms; } };
}
async function signed(faucet, key = Ed25519Keypair.generate(), requestOrigin = origin) {
  const address = key.toSuiAddress();
  const challenge = await faucet.challenge(address, requestOrigin);
  const { signature } = await key.signPersonalMessage(new TextEncoder().encode(challenge.message));
  return { address, nonce: challenge.nonce, signature };
}

test('a real wallet ownership signature funds its own address with exactly 250 MockUSD', async () => {
  const h = setup();
  const payload = await signed(h.faucet);
  const result = await h.faucet.claim({ ...payload, amount: '999999999999' }, origin);
  assert.deepEqual(h.calls, [{ address: payload.address, amount: CLAIM_AMOUNT }]);
  assert.equal(result.network, 'testnet');
  assert.equal(result.amount, '250000000');
  assert.equal(result.gasRequested, true);
  assert.equal(h.state().claims[payload.address].status, 'confirmed');
});
test('a different wallet cannot sign a claim for the buyer', async () => {
  const h = setup();
  const owner = Ed25519Keypair.generate(), other = Ed25519Keypair.generate();
  const c = await h.faucet.challenge(owner.toSuiAddress(), origin);
  const { signature } = await other.signPersonalMessage(new TextEncoder().encode(c.message));
  await assert.rejects(h.faucet.claim({ address: owner.toSuiAddress(), nonce: c.nonce, signature }, origin), { status: 401 });
  assert.equal(h.calls.length, 0);
  assert.equal(Object.keys(h.state().claims).length, 0);
});
test('claim proof is bound to the requesting origin', async () => {
  const h = setup(), payload = await signed(h.faucet);
  await assert.rejects(h.faucet.claim(payload, 'https://other.example'), { status: 401 });
  assert.equal(h.calls.length, 0);
});
test('expired proofs and replayed signatures never mint', async () => {
  const h = setup(), expired = await signed(h.faucet);
  h.advance(120001);
  await assert.rejects(h.faucet.claim(expired, origin), { status: 401 });
  const valid = await signed(h.faucet);
  await h.faucet.claim(valid, origin);
  await assert.rejects(h.faucet.claim(valid, origin), { status: 401 });
  assert.equal(h.calls.length, 1);
});
test('concurrent requests for one buyer reserve only one mint', async () => {
  const h = setup(), key = Ed25519Keypair.generate();
  const one = await signed(h.faucet, key), two = await signed(h.faucet, key);
  const results = await Promise.allSettled([h.faucet.claim(one, origin), h.faucet.claim(two, origin)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(h.calls.length, 1);
});
test('the claim record survives service recreation and prevents a second mint', async () => {
  const h = setup(), key = Ed25519Keypair.generate();
  await h.faucet.claim(await signed(h.faucet, key), origin);
  const restarted = createDemoFaucet(h.config);
  await assert.rejects(restarted.challenge(key.toSuiAddress(), origin), { status: 409 });
  assert.equal(h.calls.length, 1);
});
test('uncertain submission is recorded before errors are returned and is not retried', async () => {
  const h = setup({ fundBuyer: async () => { const e = new Error('network interrupted'); e.digest = 'submitted-test-digest'; throw e; } });
  const key = Ed25519Keypair.generate(), payload = await signed(h.faucet, key);
  await assert.rejects(h.faucet.claim(payload, origin), e => e.status === 503 && e.message.includes('submitted-test-digest'));
  assert.equal(h.state().claims[payload.address].status, 'unknown');
  assert.equal(h.state().claims[payload.address].digest, 'submitted-test-digest');
  await assert.rejects(createDemoFaucet(h.config).challenge(key.toSuiAddress(), origin), { status: 409 });
});
test('issuer checks run before reserving a claim or submitting a transaction', async () => {
  const h = setup({ preflight: async () => { throw new Error('wrong issuer'); } });
  await assert.rejects(h.faucet.claim(await signed(h.faucet), origin), /wrong issuer/);
  assert.equal(h.calls.length, 0);
  assert.equal(Object.keys(h.state().claims).length, 0);
});
test('issuer account cannot claim, and the total budget stops new wallets', async () => {
  const h = setup({ maxClaims: 1 });
  await assert.rejects(h.faucet.challenge(deployment.issuerAddress, origin), { status: 400 });
  await h.faucet.claim(await signed(h.faucet), origin);
  await assert.rejects(h.faucet.challenge(Ed25519Keypair.generate().toSuiAddress(), origin), { status: 429 });
  assert.equal(h.calls.length, 1);
});
test('persistent reservation is written before the signing adapter is invoked', async () => {
  const h = setup({ fundBuyer: async address => {
    assert.equal(h.state().claims[address].status, 'pending');
    return { digest: 'confirmed-test-digest' };
  } });
  await h.faucet.claim(await signed(h.faucet), origin);
});
test('existing inventory is preserved and never automatically replenished on restart', async () => {
  const h = setup(); let count = 0;
  const options = { store: h.config.store, readInventory: async () => 100n, mintInventory: async () => { count++; return { digest: 'mint' }; } };
  await prepareDemoInventory(options);
  await prepareDemoInventory({ ...options, readInventory: async () => 0n });
  assert.equal(count, 0);
  assert.equal(h.state().inventoryPreparation.status, 'existing');
});
test('an empty demo inventory is seeded once with a fixed 100 DemoGold', async () => {
  const h = setup(); const amounts = [];
  const options = { store: h.config.store, readInventory: async () => 0n, mintInventory: async n => {
    assert.equal(h.state().inventoryPreparation.status, 'pending');
    amounts.push(n); return { digest: 'mint' };
  } };
  await prepareDemoInventory(options);
  await prepareDemoInventory(options);
  assert.deepEqual(amounts, [100_000_000n]);
});
test('uncertain inventory preparation is not minted again after restart', async () => {
  const h = setup(); let calls = 0;
  const options = { store: h.config.store, readInventory: async () => 0n, mintInventory: async () => { calls++; throw new Error('network interrupted'); } };
  await assert.rejects(prepareDemoInventory(options), { status: 503 });
  await assert.rejects(prepareDemoInventory(options), { status: 503 });
  assert.equal(calls, 1);
});
