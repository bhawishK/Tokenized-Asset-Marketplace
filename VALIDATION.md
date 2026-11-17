# Validation record

**Later Expo migration:** dependencies for the original Vite app were installed outside the preceding agent turn. Its baseline type check found an SDK version mismatch; the source pin is aligned, but the existing root lockfile needs regeneration with `npm install`. Shared API TypeScript checking and 14 local domain/handoff tests now pass. Expo dependency downloads remain blocked. See [the migration validation record](mobile/VALIDATION.md) for the current results. The table below preserves the original session's observations.

Observed in the provided Windows workspace on **2026-11-17**. These results describe commands actually attempted, not intended checks.

| Check | Actual result |
| --- | --- |
| Workspace and instructions | Empty workspace; no applicable `AGENTS.md` found in the workspace or checked parent directories. App created in dedicated `mobile-tokenization-app/`. |
| Official API review | Read official React dApp Kit, gRPC/querying, execution, CLI installation/client/Move and Coin/scenario references linked in README. |
| Node runtime | `v24.17.0` |
| `node --test tests/domain.test.mjs` | **PASS: 10 tests, 0 failures.** Unit conversion, input bounds, fixed price, ordinary purchase validation, receipt deltas, separate SUI gas, address validation. Does not execute Move. |
| `node --check scripts/prove-atomicity.mjs` | **PASS**, syntax check only; SDK imports/network calls not executed. |
| `node --check src/domain.ts` and `node --check src/chain.ts` | **PASS**, Node syntax parsing only; not a TypeScript type check or SDK integration test. |
| PowerShell parser on `scripts/seed.ps1` | **PASS**, no syntax errors; no seed transactions executed. |
| `npm.cmd install --cache .npm-cache --fetch-retries=0 --fetch-timeout=10000 --ignore-scripts` | **BLOCKED:** registry fetch failed with `EACCES`; network access denied. No complete installation or lockfile. |
| `npm.cmd run typecheck` | **BLOCKED:** `tsc` unavailable because dependencies could not be installed. |
| `npm.cmd run build` | **BLOCKED:** `tsc` unavailable. No production build generated. |
| `sui move build --path contracts` | **BLOCKED:** `sui` not found. |
| `sui move test --path contracts` | **BLOCKED:** `sui` not found. Seven tests written, no Move pass claimed. |
| Browser smoke/screenshot | **NOT RUN:** app dependencies/build unavailable; no screenshot generated. |
| Publish/initialize/seed | **NOT RUN:** CLI unavailable; no configured funded signer inspected or used. |
| Confirmed successful purchase | **NOT RUN:** no package, marketplace or digest to record. |
| EPayment dry run and unchanged snapshots | **NOT RUN:** reproducible script provided; needs actual Testnet deployment and funded buyer. |
| Measured Testnet latency | **NOT MEASURED.** |

## Remaining release checks

1. Install dependencies on a network-enabled machine and retain `package-lock.json`.
2. Install the official Testnet Sui CLI, record `sui --version`, run the Move build/tests and retain `Move.lock`. Fix any compiler/test failures before publishing.
3. Run frontend type check/production build; resolve any SDK peer or API incompatibilities rather than suppressing type errors.
4. Publish with a dedicated funded Testnet issuer, initialize and seed a distinct buyer as documented.
5. Configure public IDs, execute one real purchase and run the atomicity proof with its actual digest. Retain the proof artifact.
6. Smoke-test the browser flows, capture a screenshot of the actual app and update this record with observed results.
