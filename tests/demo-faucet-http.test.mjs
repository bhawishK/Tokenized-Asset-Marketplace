import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createFundingHttpServer } from '../scripts/demo-faucet-http.mjs';

async function fixture(t) {
  const calls = [];
  const server = createFundingHttpServer({
    deployment: { packageId: 'package', marketplaceId: 'market' },
    origins: new Set(['http://localhost:8081']),
    faucet: {
      challenge: async (address, origin) => { calls.push({ address, origin }); return { nonce: 'nonce', message: 'ownership message' }; },
      claim: async () => { calls.push('claim'); return { digest: 'test' }; },
    },
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return {
    calls,
    send(path, { method = 'GET', origin = 'http://localhost:8081', host = '127.0.0.1:8788', body } = {}) {
      return new Promise((resolve, reject) => {
        const headers = { Host: host, 'Content-Type': 'application/json' };
        if (origin) headers.Origin = origin;
        const req = request({ host: '127.0.0.1', port: server.address().port, path, method, headers }, res => {
          let text = ''; res.setEncoding('utf8'); res.on('data', s => text += s);
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: text ? JSON.parse(text) : null }));
        });
        req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
      });
    },
  };
}
test('local browser health/preflight expose only the configured Testnet funding policy', async t => {
  const h = await fixture(t);
  const health = await h.send('/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.network, 'testnet');
  assert.equal(health.body.amount, '250000000');
  assert.equal(health.headers['access-control-allow-origin'], 'http://localhost:8081');
  const options = await h.send('/claim', { method: 'OPTIONS' });
  assert.equal(options.status, 204);
});
test('untrusted origins, rebound hostnames and missing origins never reach funding', async t => {
  const h = await fixture(t);
  assert.equal((await h.send('/challenge', { method: 'POST', origin: 'https://other.example', body: { address: 'buyer' } })).status, 403);
  assert.equal((await h.send('/challenge', { method: 'POST', host: 'other.example:8788', body: { address: 'buyer' } })).status, 403);
  assert.equal((await h.send('/challenge', { method: 'POST', origin: null, body: { address: 'buyer' } })).status, 404);
  assert.equal(h.calls.length, 0);
});
test('browser request passes its wallet address through and cannot override mint parameters', async t => {
  const h = await fixture(t);
  const challenge = await h.send('/challenge', { method: 'POST', body: { address: 'connected-wallet' } });
  assert.equal(challenge.status, 200);
  assert.deepEqual(h.calls, [{ address: 'connected-wallet', origin: 'http://localhost:8081' }]);
  const claim = await h.send('/claim', { method: 'POST', body: { address: 'connected-wallet', nonce: 'nonce', signature: 'sig', amount: '99999999', issuerCapId: 'attacker-choice' } });
  assert.equal(claim.status, 400);
  assert.equal(h.calls.length, 1);
});
