# Validation record

## Wallet confirmation fix ? 2026-11-18

Reproduced the pre-wallet exception with the installed SDK: calling toJSON() on the purchase PTB raised 'Sender must be set to resolve CoinWithBalance'. The Expo boundary now preserves that intent while serializing, then reconstructs the transaction in the web wallet adapter so dApp Kit supplies its connected sender and Testnet client before resolution. Transfers and redemption use the same path. Pending/error feedback scrolls into view, and a changed connection produces an explicit error rather than a silent execute return.

Validation: a real SDK regression reconstructs the purchase, supplies a fixture sender, resolves payment against a mocked coin/balance transport, and confirms the resulting purchase Move call. All 39 local tests pass; Expo type check and web production export pass. No real wallet signature, Testnet purchase or purchase digest was produced by these checks.


## Purchase readiness fix ? 2026-11-18

Reproduced a disabled Review purchase button by executing the Expo component's refresh callback with balances/inventory resolved and event history pending. The regression failed before the fix and passes after releasing the balance-loading state before the optional event lookup. The purchase card now displays its blocking reason, including configuration, connection, network read, quantity/funds/stock, pending action and issuer-as-buyer restrictions.

Validation: 38 local tests pass; Expo TypeScript check and web production export pass. The local funding service's persistent record contains one confirmed claim; this is service-record evidence, not an independently fetched purchase receipt. Browser wallet signing and a real atomic purchase remain unverified in this session. Earlier entries below retain their historical results.


## Connected-wallet funding

The frontend now reads the connected Slush address directly and requests a fixed demo claim from a local, issuer-authorized service. No buyer address is required in chat or in command-line variables. Thirty local domain/funding/HTTP/handoff tests, the Expo type check and the new web production export pass. The existing issuer CLI configuration passed a read-only preflight. Live service minting/claims and an actual purchase receipt have not yet been verified. See `docs/DEMO_FUNDING.md` and `mobile/VALIDATION.md` for the flow, limits and precise evidence.

## Marketplace initialized — issuer terminal report

Successful initialization was supplied for transaction `EpqV8imv4DZS8hLXeDwoX8jEYwUzncy9nRuovcp8KDDd`. The transcript identifies shared Marketplace `0xa3ee5ffd11ad2b974d8594cab21dbd4f7c10e9b2af191a5daf95c3c1d0db2a00` and issuer-owned IssuerCap `0xec91fbc9166aff9056788c8bb2e9a4ea0d74a6ea4318f8f0ec2e3bb346b00ad4`. The asset TreasuryCaps were wrapped inside that capability, not destroyed as asset authorities. Local Vite and Expo public deployment configuration now points to these IDs. No inventory funding, buyer funding or purchase receipt has yet been supplied or verified. Agent-side independent network reads remain blocked.

## Package published — issuer terminal report

The issuer supplied successful publication effects for package `0xc2cc60cb02df3d08b45e7e29f5c7336e14cefcfc9d7c8647fc61d0dfda6048e0`, transaction `GvDQ23YMwsbBkMpjKsVRJcZDzj6jeWCu3MTx4TozDvYT`. Public identifiers are recorded in `deployments/testnet.json`. Independent lookup with the Testnet SDK was attempted but failed with `fetch failed` under this session's network restrictions. The publish digest is **not** a purchase receipt. Marketplace initialization, seeding and purchase verification remain outstanding.

## Move verification completed — 2026-11-18

The user ran `sui move build --build-env testnet` successfully and supplied a passing seven-test summary. The agent then copied the public framework dependency cache into the ignored project `.move-cache` and independently ran `sui move test --path contracts --build-env testnet`: **7 passed, 0 failed**, exit code 0, with Sui `1.84.0-9dc25070cf2e`. The generated `contracts/Move.lock` pins framework revision `e6f43880f4b65e2c1f0397583a9690b4b22c9223` and should be tracked.

Warnings remain for the supported but deprecated `coin::create_currency` API and intentional direct-to-sender delivery/change. No publish, funded issuer, live purchase or Testnet dry-run proof has been verified yet. A recovery phrase was disclosed in the supplied CLI transcript; that account must not be used as issuer. Create a fresh dedicated issuer without printing secret output and retain keys only in the user's private CLI keystore.

## Sui CLI follow-up — 2026-11-18

Sui Testnet CLI is now installed at `C:\Users\user\AppData\Local\bin\sui.exe`, reporting `sui 1.84.0-9dc25070cf2e`. The agent's `move build --build-env testnet` attempt reached framework dependency resolution but failed cloning the pinned Sui framework from GitHub because shell network access is blocked. No Move build/test pass or deployment is claimed. The temporary wallet created by the CLI's first-run setup was discarded and must not be funded or used; no transaction was signed. Project-local Sui configuration and Move caches are excluded from Git. Run the build and tests in the user's network-enabled terminal before publishing.

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
