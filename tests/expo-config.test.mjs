import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { validAddress } from '../src/domain.ts';

const source = readFileSync(new URL('../mobile/src/config.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const packageId = '0x' + '1'.repeat(64), marketplaceId = '0x' + '2'.repeat(64);
function load(env, extra) {
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, process: { env },
    require(name) {
      if (name === 'expo-constants') return { expoConfig: { extra } };
      if (name === '../../src/marketplace-api') return { createMarketplaceApi: config => ({ ...config, configured: validAddress(config.packageId) && validAddress(config.marketplaceId) }) };
      throw new Error(`Unexpected module ${name}`);
    },
  });
  return exports;
}
test('actual client config uses public environment IDs when the bundled Expo manifest is stale', () => {
  const client = load({ EXPO_PUBLIC_PACKAGE_ID: packageId, EXPO_PUBLIC_MARKETPLACE_ID: marketplaceId }, { packageId: '', marketplaceId: '' });
  assert.equal(client.api.configured, true);
  assert.equal(client.api.packageId, packageId);
  assert.equal(client.api.marketplaceId, marketplaceId);
});
test('native manifest configuration remains a fallback when public environment values are absent', () => {
  assert.equal(load({}, { packageId, marketplaceId }).api.configured, true);
});
test('explicit invalid environment IDs cannot silently fall back to an old deployment', () => {
  assert.equal(load({ EXPO_PUBLIC_PACKAGE_ID: '' }, { packageId, marketplaceId }).api.configured, false);
});
