/** Local-only Testnet issuer service. Wallet keys stay in the user's CLI keystore. */
import { createFundingHttpServer } from './demo-faucet-http.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, rename, mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { bcs } from '@mysten/sui/bcs';
import { createDemoFaucet, prepareDemoInventory, FundingError, CLAIM_AMOUNT, MAX_CLAIMS } from './demo-faucet-core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deployment = JSON.parse(await readFile(path.join(root, 'deployments/testnet.json'), 'utf8'));
for (const field of ['packageId', 'marketplaceId', 'issuerAddress', 'issuerCapId']) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(deployment[field] ?? '') || /^0x0+$/.test(deployment[field])) throw new Error(`Configure ${field} in deployments/testnet.json first.`);
}
if (deployment.network !== 'testnet') throw new Error('This service only supports Testnet.');
const run = promisify(execFile);
const profile = process.env.USERPROFILE || os.homedir();
const config = process.env.SUI_CLIENT_CONFIG || path.join(profile, '.sui/sui_config/client.yaml');
await access(config, constants.R_OK).catch(() => { throw new Error('Existing Sui CLI config is required. No wallet will be created by this service.'); });
let sui = process.env.SUI_BIN || 'sui';
if (!process.env.SUI_BIN && process.platform === 'win32') {
  const installed = path.join(process.env.LOCALAPPDATA || path.join(profile, 'AppData/Local'), 'bin/sui.exe');
  try { await access(installed); sui = installed; } catch { /* Use PATH in the user's terminal. */ }
}
const prefix = ['client', '--client.config', config, '--client.env', 'testnet'];
const cliEnv = { ...process.env, SUI_CONFIG_DIR: path.dirname(config) };
async function cli(args, timeout = 90_000) {
  return (await run(sui, [...prefix, ...args], { cwd: root, env: cliEnv, windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024 })).stdout.trim();
}
async function preflight() {
  const active = await cli(['active-address']);
  if (active.toLowerCase() !== deployment.issuerAddress.toLowerCase()) throw new FundingError(503, 'Select the deployed issuer in your local Sui CLI before starting demo funding.');
  if (await cli(['active-env']) !== 'testnet') throw new FundingError(503, 'Testnet environment is required.');
}
const client = new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://fullnode.testnet.sui.io:443' });
const directory = path.join(root, '.demo-faucet');
const statePath = path.join(directory, 'claims.json');
const deploymentKey = `${deployment.packageId}:${deployment.marketplaceId}`;
const store = {
  async load() {
    try {
      const state = JSON.parse(await readFile(statePath, 'utf8'));
      if (state.deployment !== deploymentKey || !state.claims || typeof state.claims !== 'object') throw new Error('Funding state does not match this deployment.');
      return state;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return { deployment: deploymentKey, claims: {} };
    }
  },
  async save(state) {
    await mkdir(directory, { recursive: true });
    const temporary = `${statePath}.tmp`;
    await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
    await rename(temporary, statePath);
  },
};
const marketBCS = bcs.struct('Marketplace', { id: bcs.Address, inventory: bcs.u64(), price: bcs.u64(), proceeds: bcs.Address });
async function prepareInventory() {
  await prepareDemoInventory({
    store,
    async readInventory() {
      const { object } = await client.getObject({ objectId: deployment.marketplaceId, include: { content: true } });
      if (object.type !== `${deployment.packageId}::marketplace::Marketplace` || object.owner.$kind !== 'Shared') throw new Error('Invalid marketplace.');
      const m = marketBCS.parse(object.content);
      if (m.proceeds !== deployment.issuerAddress || BigInt(m.price) !== 100n) throw new Error('Unexpected marketplace configuration.');
      return BigInt(m.inventory);
    },
    async mintInventory(amount) {
      let digest;
      try {
        const result = JSON.parse(await cli(['call', '--package', deployment.packageId, '--module', 'marketplace', '--function', 'mint_inventory', '--args', deployment.issuerCapId, deployment.marketplaceId, amount.toString(), '--gas-budget', '100000000', '--json']));
        digest = result.digest;
        if (!digest || result.effects?.status?.status !== 'success') throw new Error('Unconfirmed mint.');
        const confirmed = await client.waitForTransaction({ digest });
        if (!confirmed.Transaction) throw new Error('Inventory mint failed.');
        return { digest };
      } catch { const error = new Error('Unconfirmed inventory preparation.'); error.digest = digest; throw error; }
    },
  });
}
const faucet = createDemoFaucet({
  deployment, store, preflight,
  verifySignature: (bytes, signature, address) => verifyPersonalMessageSignature(bytes, signature, { address, client }),
  async fundBuyer(buyer, amount) {
    let digest;
    try {
      const output = JSON.parse(await cli(['call', '--package', deployment.packageId, '--module', 'marketplace', '--function', 'fund_buyer', '--args', deployment.issuerCapId, amount.toString(), buyer, '--gas-budget', '100000000', '--json']));
      digest = output.digest;
      if (!digest || output.effects?.status?.status !== 'success') throw new Error('Unconfirmed CLI result.');
      const result = await client.waitForTransaction({ digest, include: { balanceChanges: true }, timeout: 60_000 });
      if (!result.Transaction) throw new Error('Funding did not succeed.');
      const delta = result.Transaction.balanceChanges
        .filter(c => c.address.toLowerCase() === buyer && c.coinType === `${deployment.packageId}::mock_usd::MOCK_USD`)
        .reduce((sum, c) => sum + BigInt(c.amount), 0n);
      if (delta !== CLAIM_AMOUNT) throw new Error('Funding balance change did not match.');
      // Gas is requested for the connected buyer automatically, not the CLI issuer.
      // Faucet rate limits must not turn a confirmed MockUSD mint into a failed claim.
      let gasRequested = false;
      try { await cli(['faucet', '--address', buyer], 20_000); gasRequested = true; } catch { /* UI provides the public faucet fallback. */ }
      return { digest, gasRequested };
    } catch {
      const error = new Error('Funding could not be verified.');
      error.digest = digest;
      throw error;
    }
  },
});
const origins = new Set(['http://localhost:8081', 'http://127.0.0.1:8081']);
if (process.env.DEMO_FAUCET_ORIGIN) origins.add(new URL(process.env.DEMO_FAUCET_ORIGIN).origin);
let ready = false;
const server = createFundingHttpServer({ faucet, deployment, origins, isReady: () => ready });
await preflight();
await store.load();
if (process.argv.includes('--check')) {
  console.log('Testnet issuer CLI and deployment configuration check passed. No transaction submitted.');
  process.exit(0);
}
// One fixed loopback port prevents two live service instances using this state.
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'Demo funding is already using port 8788. Stop the other instance first.' : 'Could not start local demo funding.'); process.exitCode = 1; });
server.listen(8788, '127.0.0.1', async () => {
  try {
    // Reserve the fixed port before any mint to prevent parallel service startup.
    console.log('Checking Testnet inventory; an empty, unprepared marketplace will be seeded once with 100 DemoGold.');
    await prepareInventory();
    ready = true;
    console.log('Testnet demo funding ready: http://127.0.0.1:8788');
    console.log('250 MockUSD per verified buyer; 100 total requests. Keys remain in the local Sui CLI keystore.');
    process.send?.({ type: 'ready' });
  } catch (error) {
    console.error(error instanceof FundingError ? error.message : 'Could not prepare the Testnet demo. Check the issuer account, gas balance and network connection.');
    server.close(() => process.exit(1));
  }
});
