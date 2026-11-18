import { randomBytes } from 'node:crypto';

export const CLAIM_AMOUNT = 250_000_000n;
export const MAX_CLAIMS = 100;
export class FundingError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export async function prepareDemoInventory({ store, readInventory, mintInventory }) {
  const state = await store.load();
  if (state.inventoryPreparation) {
    if (['existing', 'confirmed'].includes(state.inventoryPreparation.status)) return;
    throw new FundingError(503, 'Initial inventory funding is pending or uncertain. The local issuer must check it before restarting.');
  }
  if (await readInventory() > 0n) {
    state.inventoryPreparation = { status: 'existing' };
    await store.save(state); return;
  }
  state.inventoryPreparation = { status: 'pending' };
  await store.save(state);
  try {
    const result = await mintInventory(100_000_000n);
    state.inventoryPreparation = { status: 'confirmed', digest: result.digest };
    await store.save(state);
  } catch (error) {
    state.inventoryPreparation = { status: 'unknown', digest: error.digest ?? null };
    await store.save(state);
    throw new FundingError(503, 'Initial inventory funding could not be confirmed. Check the local issuer transaction before retrying.');
  }
}
function addressOf(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value) || /^0x0+$/.test(value)) throw new FundingError(400, 'Connect a valid Sui wallet first.');
  return value.toLowerCase();
}

/** One fixed claim per wallet, with durable reservation BEFORE signing a transaction. */
export function createDemoFaucet({ deployment, store, verifySignature, preflight, fundBuyer, now = Date.now, maxClaims = MAX_CLAIMS }) {
  const challenges = new Map();
  let queue = Promise.resolve();
  function exclusive(fn) {
    const result = queue.then(fn);
    queue = result.catch(() => {});
    return result;
  }
  function ensureBuyer(address) {
    if (address === deployment.issuerAddress.toLowerCase()) throw new FundingError(400, 'Connect a separate buyer wallet, not the issuer account.');
  }
  async function challenge(address, origin) {
    address = addressOf(address); ensureBuyer(address);
    const state = await store.load();
    if (state.claims[address]) throw new FundingError(409, claimMessage(state.claims[address]));
    if (Object.keys(state.claims).length >= maxClaims) throw new FundingError(429, 'This demo funding service has reached its total claim limit.');
    for (const [id, c] of challenges) if (c.expires <= now()) challenges.delete(id);
    if (challenges.size >= 200) throw new FundingError(429, 'Too many pending requests. Try again shortly.');
    const nonce = randomBytes(24).toString('hex');
    const expires = now() + 120_000;
    const message = [
      'Aurum Testnet demo funding', 'Network: sui:testnet', `Origin: ${origin}`,
      `Package: ${deployment.packageId}`, `Marketplace: ${deployment.marketplaceId}`,
      `Wallet: ${address}`, 'Request: 250 simulated MockUSD, once per wallet.',
      'This message proves wallet ownership. It does not authorize a purchase or transfer of your assets.',
      `Challenge: ${nonce}`, `Expires: ${new Date(expires).toISOString()}`,
    ].join('\n');
    challenges.set(nonce, { address, origin, expires, message });
    return { nonce, message, expires };
  }
  async function claim({ address, nonce, signature }, origin) {
    address = addressOf(address); ensureBuyer(address);
    const c = challenges.get(nonce);
    // Consume once even when verification fails; replay cannot trigger another mint.
    challenges.delete(nonce);
    if (!c || c.address !== address || c.origin !== origin || c.expires <= now()) throw new FundingError(401, 'Funding request expired or does not match this wallet. Request a new message.');
    if (typeof signature !== 'string' || signature.length > 8000) throw new FundingError(401, 'Wallet signature is missing or invalid.');
    try { await verifySignature(new TextEncoder().encode(c.message), signature, address); }
    catch { throw new FundingError(401, 'Could not verify this wallet signature. No funding transaction was submitted.'); }
    return exclusive(async () => {
      const state = await store.load();
      if (state.claims[address]) throw new FundingError(409, claimMessage(state.claims[address]));
      if (Object.keys(state.claims).length >= maxClaims) throw new FundingError(429, 'This demo funding service has reached its total claim limit.');
      await preflight();
      // Never retry an uncertain signing/submission automatically, including after restart.
      state.claims[address] = { status: 'pending', requestedAt: new Date(now()).toISOString() };
      await store.save(state);
      let funded;
      try { funded = await fundBuyer(address, CLAIM_AMOUNT); }
      catch (error) {
        state.claims[address] = { ...state.claims[address], status: 'unknown', digest: error.digest ?? null };
        await store.save(state);
        throw new FundingError(503, error.digest ? `Funding verification is pending. Check transaction ${error.digest}; do not submit another request.` : 'Funding could not be confirmed. The request is reserved to avoid duplicate minting; the local issuer must check it before retrying.');
      }
      state.claims[address] = { ...state.claims[address], status: 'confirmed', digest: funded.digest };
      await store.save(state);
      return { digest: funded.digest, amount: CLAIM_AMOUNT.toString(), network: 'testnet', gasRequested: funded.gasRequested === true };
    });
  }
  return { challenge, claim };
}
function claimMessage(record) {
  return record.status === 'confirmed'
    ? `This wallet already received its demo claim. ${record.digest ? `Transaction: ${record.digest}` : ''}`
    : `This wallet has a pending or uncertain funding request.${record.digest ? ` Check transaction ${record.digest}.` : ' The local issuer must check its status before retrying.'}`;
}
