import test from 'node:test';
import assert from 'node:assert/strict';
import { fundingBlockReason } from '../src/funding-state.ts';

const ready = { configured: true, connected: true, wrongNetwork: false, serviceReady: true, working: false, otherActionPending: false };
test('an already-connected/restored Testnet account is eligible without a fresh connection event', () => {
  assert.equal(fundingBlockReason(ready), null);
});
test('service recovery enables the action without disconnecting the existing wallet', () => {
  assert.match(fundingBlockReason({ ...ready, serviceReady: false }), /retries automatically/);
  assert.equal(fundingBlockReason({ ...ready, serviceReady: true }), null);
});
test('a missing wallet account and wrong network produce different actionable reasons', () => {
  assert.match(fundingBlockReason({ ...ready, connected: false }), /active account/);
  assert.match(fundingBlockReason({ ...ready, wrongNetwork: true }), /Testnet/);
});
test('pending funding is distinguished from a different pending wallet action', () => {
  assert.match(fundingBlockReason({ ...ready, working: true, otherActionPending: true }), /funding request/);
  assert.match(fundingBlockReason({ ...ready, otherActionPending: true }), /Another wallet action/);
});
