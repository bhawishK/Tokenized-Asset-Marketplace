import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Execute the component's real refresh callback with a deliberately pending history read.
const source = readFileSync(new URL('../mobile/src/MarketplaceApp.tsx', import.meta.url), 'utf8');
const body = source.match(/const refresh = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[address, sample\]\);/)[1];
test('ready balances and inventory unlock purchases while activity history is still pending', async () => {
  let loading = false, market = null, balances = null;
  let finishHistory;
  const history = new Promise(resolve => { finishHistory = resolve; });
  const context = {
    sample: false, address: 'buyer', generation: { current: 0 },
    api: { configured: true, readMarket: async () => ({ inventory: 100n }), readWallet: async () => ({ usd: 250n }), readActivity: () => history },
    setLoading: value => { loading = value; }, setMarket: value => { market = value; }, setBalances: value => { balances = value; },
    setActivity() {}, setRequests() {}, setHistoryNote() {}, setError() {}, message: String,
  };
  const run = vm.runInNewContext(`(async () => {${body}\n})`, context)();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(market && balances, 'network balances are available');
  try { assert.equal(loading, false, 'optional history must not keep Review purchase disabled'); }
  finally { finishHistory({ activity: [], requests: [], limited: false }); await run; }
});
