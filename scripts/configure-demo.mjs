/** Generate public local configuration without replacing an existing environment file. */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validAddress } from '../src/domain.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deployment = JSON.parse(await readFile(path.join(root, 'deployments/testnet.json'), 'utf8'));
if (deployment.network !== 'testnet' || !validAddress(deployment.packageId) || !validAddress(deployment.marketplaceId)) {
  throw new Error('Set valid public Testnet packageId and marketplaceId values in deployments/testnet.json first.');
}
const files = [
  ['.env.local', `# Public Sui Testnet identifiers only.\nVITE_PACKAGE_ID=${deployment.packageId}\nVITE_MARKETPLACE_ID=${deployment.marketplaceId}\n`],
  ['mobile/.env.local', `# Public Sui Testnet identifiers only.\nEXPO_PUBLIC_PACKAGE_ID=${deployment.packageId}\nEXPO_PUBLIC_MARKETPLACE_ID=${deployment.marketplaceId}\nEXPO_PUBLIC_WEB_APP_URL=\nEXPO_PUBLIC_DEMO_FAUCET_URL=http://127.0.0.1:8788\n`],
];
for (const [name, content] of files) {
  try {
    await writeFile(path.join(root, name), content, { flag: 'wx', mode: 0o600 });
    console.log(`Created ${name} from deployments/testnet.json.`);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.log(`Kept existing ${name}.`);
  }
}
console.log('Restart Expo after changing configuration. No wallet was created and no transaction was submitted.');
