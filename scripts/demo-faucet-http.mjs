import { createServer } from 'node:http';
import { FundingError, CLAIM_AMOUNT, MAX_CLAIMS } from './demo-faucet-core.mjs';

export function createFundingHttpServer({ faucet, deployment, origins, isReady = () => true }) {
return createServer(async (req, res) => {
  const origin = req.headers.origin;
  const host = req.headers.host;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['localhost:8788', '127.0.0.1:8788'].includes(host) || (origin && !origins.has(origin))) {
    res.writeHead(403); res.end(JSON.stringify({ error: 'This local funding service does not allow this origin.' })); return;
  }
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  function reply(status, value) { res.writeHead(status); res.end(JSON.stringify(value)); }
  try {
    if (!isReady()) { reply(503, { error: 'Local issuer is preparing the demo. Retry shortly.' }); return; }
    if (req.method === 'GET' && req.url === '/health') {
      reply(200, { network: 'testnet', packageId: deployment.packageId, marketplaceId: deployment.marketplaceId, amount: CLAIM_AMOUNT.toString(), maxClaims: MAX_CLAIMS }); return;
    }
    if (!origin || req.method !== 'POST' || !['/challenge', '/claim'].includes(req.url)) { reply(404, { error: 'Not found.' }); return; }
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new FundingError(415, 'JSON is required.');
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 12_000) throw new FundingError(413, 'Request is too large.'); chunks.push(chunk); }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new FundingError(400, 'Invalid JSON.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new FundingError(400, 'Invalid request.');
    const allowed = req.url === '/challenge' ? ['address'] : ['address', 'nonce', 'signature'];
    if (Object.keys(body).some(k => !allowed.includes(k))) throw new FundingError(400, 'Unexpected funding parameters.');
    const result = req.url === '/challenge' ? await faucet.challenge(body.address, origin) : await faucet.claim(body, origin);
    reply(200, result);
  } catch (error) {
    reply(error instanceof FundingError ? error.status : 503, { error: error instanceof FundingError ? error.message : 'The local issuer service is unavailable. Check its terminal; do not share keys.' });
  }
});
}
