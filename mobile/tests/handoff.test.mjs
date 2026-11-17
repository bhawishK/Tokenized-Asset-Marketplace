import test from 'node:test';
import assert from 'node:assert/strict';
import { slushBrowserUrl } from '../src/handoff.ts';

test('uses the documented Slush app-browser route for the configured web app', () => {
  assert.equal(slushBrowserUrl('https://aurum.example.org/app/'), 'https://my.slush.app/browse/https://aurum.example.org/app/');
});
test('requires deployment configuration rather than opening a placeholder', () => {
  assert.throws(() => slushBrowserUrl(''));
  assert.throws(() => slushBrowserUrl('YOUR_WEB_APP_URL'));
});
test('rejects insecure URLs, credentials and local-only addresses', () => {
  for (const url of ['http://app.example.org', 'javascript:alert(1)', 'https://issuer:secret@app.example.org', 'https://localhost', 'https://127.0.0.1', 'https://[::1]']) assert.throws(() => slushBrowserUrl(url), undefined, url);
});
test('rejects callback and transaction query payloads; a link never asserts success', () => {
  for (const url of ['https://app.example.org/?success=true', 'https://app.example.org/#signed', 'https://app.example.org/?redirect=https://evil.example']) assert.throws(() => slushBrowserUrl(url), undefined, url);
});
