import { fork, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const funding = fork(path.join(root, 'scripts/demo-faucet.mjs'), { cwd: root, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
let web;
let starting = false;
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  funding.kill(); web?.kill();
  process.exitCode = code;
}
funding.on('message', async message => {
  if (message?.type !== 'ready' || web || starting || stopping) return;
  starting = true;
  try {
    const existing = await fetch('http://localhost:8081', { signal: AbortSignal.timeout(2000) });
    if (existing.ok) {
      console.log('A web server is already running at http://localhost:8081. Reload your existing Aurum tab to use demo funding.');
      return;
    }
  } catch { /* Start Expo when no web server is running. */ }
  if (stopping) return;
  web = spawn(process.execPath, [path.join(root, 'mobile/node_modules/expo/bin/cli'), 'start', '--web', '--host', 'localhost', '--port', '8081'], {
    cwd: path.join(root, 'mobile'), stdio: 'inherit', windowsHide: true, env: { ...process.env, EXPO_OFFLINE: '1' },
  });
  web.on('error', () => { console.error('Could not start Expo. Install dependencies in mobile/ first.'); stop(1); });
  web.on('exit', code => stop(code ?? 0));
});
funding.on('error', () => { console.error('Could not start demo funding.'); stop(1); });
funding.on('exit', code => { if (!stopping) stop(code ?? 1); });
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
