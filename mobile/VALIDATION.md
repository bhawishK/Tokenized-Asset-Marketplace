# Expo migration validation

## Repository handoff - 2026-11-18

Final checks for this handoff: 39 local tests pass; Move build succeeds and all 7 Move tests pass; Expo type check and web export pass; legacy Vite production build passes after replacing a stale ignored installed SDK folder with the already-installed matching Expo SDK 2.39.1. The source lockfile was reconciled offline. Public configuration creation and preservation were smoke-tested in a temporary fixture. These checks do not claim a fresh network install or live Testnet purchase.

Added actual Expo web screenshots in docs/screenshots, captured at a 430 x 1000 CSS-pixel phone viewport. The browser was driven through Account > Try sample mode, Buy Gold > Review purchase > Run sample purchase, then Portfolio and Account. These captures show a disconnected wallet and explicitly labelled sample balances/activity; no transaction was signed or submitted. Headless browser capture with installed Edge succeeded after the interactive computer-use pipe was unavailable. This supersedes earlier entries saying screenshots were unavailable. Native iPhone signing remains unverified.

The root README now describes the three tabs, fresh-clone setup, complete loopback-only issuer service plus Expo startup, separate component commands, Testnet publishing, gas funding and phone/native limitations. Added configure:demo to create public local env files without replacing existing files. The root lockfile now matches the pinned Sui SDK 2.39.1 using the already committed Expo lock metadata; npm completed an offline package-lock-only reconciliation and a dry-run clean-install check. This is not a fresh network installation.



## Three-tab simplification - 2026-11-18

Replaced the marketing hero, top tabs and repeated project copy with persistent Buy Gold, Portfolio and Account tabs. Funding and wallet setup live in Account; issuer tools, digest lookup and gold actions use progressive disclosure. Added system light/dark palettes, 17-point body copy, 50-point action controls and a scrollable confirmation modal. No contract or authority changes.

Checks: 39 local tests pass, Expo TypeScript passes, web export passes, Android JavaScript/Hermes export passes. A fixture-based server render of the actual component passed for all three tabs, checking that purchase content, activity and funding are scoped to the correct tab and issuer actions are initially collapsed. This does not validate browser layout or wallet interaction. Computer-use preview failed because the native pipe was unavailable; no screenshot or device runtime verification is claimed. Contrast calculations and layout rationale are in ../docs/DESIGN.md. Earlier entries are historical.


## Stale web-manifest configuration fix

The running Metro bundle contained correct `EXPO_PUBLIC_PACKAGE_ID` / `EXPO_PUBLIC_MARKETPLACE_ID` environment values, but its cached `APP_MANIFEST` extras had empty IDs. The client read only `Constants.expoConfig.extra`, producing the missing-deployment warning and disabling funding. A regression test against the actual client configuration module failed before the fix. The client now prefers direct `process.env.EXPO_PUBLIC_*` references, which Metro transforms to its public environment, and retains manifest fallback when those values are absent.

All **37 local tests**, Expo type checking and the web export pass after the fix. The actual served configuration module was replayed against its served public environment with empty manifest extras and resolved the correct real package and marketplace IDs. This verifies configuration resolution, not a live wallet claim or purchase.

## Connected-wallet funding follow-up

Added the web **Get 250 demo MockUSD** flow and a loopback-only issuer service. The buyer address comes from Slush, is proven with a signed personal-message challenge, and is never requested in chat or a PowerShell variable. The service retains mint authority in the issuer's CLI keystore, fixes the amount, bounds/reserves persistent claims and verifies confirmed Testnet balance changes before reporting a funded claim. Initial empty inventory can be seeded once through the same issuer.

- `node --test tests/*.test.mjs mobile/tests/*.test.mjs` from the repository root: **30 passed**, 0 failed. Uses real in-memory Ed25519 signatures and a fake transaction-submission adapter, plus HTTP boundary tests; it is not a live faucet transaction proof.
- Expo `npm run typecheck`: **passed**.
- Expo `npm run build:web`: **passed** with the new funding UI.
- Expo Android JavaScript/Hermes export: **passed** with the new funding UI; no device runtime claim.
- `node scripts/demo-faucet.mjs --check`: **passed** against the local issuer CLI/configuration, without signing or submitting a transaction.
- A real connected-wallet funding claim and purchase remain **unverified**. Run `npm run demo` in the user's network-enabled terminal, connect Slush and use the funding button. No buyer address or private material needs to be sent to the assistant.

## Local run check — 2026-11-18

Contract follow-up: the user's Move build succeeded, and the agent independently reran the Move tests with the cached framework: **7 passed, 0 failed**. `contracts/Move.lock` now pins the framework revision. Testnet deployment and live transaction verification still remain.

Dependencies are now installed. Fixed the React Native `ScrollView` ref type by using `ComponentRef<typeof ScrollView>`.

- `npm run typecheck`: **passed**.
- Shared domain and handoff tests: **14 passed**, 0 failed.
- `npm run build:web`: **passed**, production export in `mobile/dist`.
- `npm run build:android -- --output-dir dist-android`: **passed**, Android JavaScript/Hermes export. This does not establish device runtime behavior or produce an APK.
- `npm run build:ios -- --output-dir dist-ios`: **passed**, iOS JavaScript/Hermes export. This does not establish device runtime behavior or produce an IPA.
- Expo web server started at `http://localhost:8081`; HTTP readiness check returned **200**.
- Browser click testing: **not completed**; computer-use app approval timed out. No successful wallet connection or purchase is claimed.
- No `.env.local` deployment configuration was present. Network purchase flows still require real Testnet deployment IDs and funded test accounts.

The record below describes the earlier migration session and its limitations at that time.

Observed on Windows, 2026-11-17.

| Check | Observed result |
| --- | --- |
| Official APIs | Checked Expo SDK 58 compatibility/template/module versions, web/export/app config and Slush mobile deep-link documentation. |
| Shared domain + handoff tests | **14 passed**, 0 failed: 10 existing domain tests and 4 mobile URL/handoff tests. |
| Shared `domain.ts` / `marketplace-api.ts` TypeScript check | **Passed** using the existing installed TypeScript and SDK, with strict checking and Bundler module resolution. |
| Eight Expo TS/TSX files | **Syntax passed** using TypeScript transpilation diagnostics. This is not a full type check. |
| Expo app and Metro config | Node syntax checks passed. Expo itself has not loaded these configurations. |
| `npm install` in `mobile/` | **Blocked:** npm registry fetch denied with `EACCES`. No mobile lockfile generated. |
| Expo full type check | **Blocked:** Expo, React Native and Expo config/types unavailable. Attempted command reported missing dependencies/base configuration. |
| Expo web, Android and iOS JS exports | **Blocked:** `expo` command unavailable because dependencies could not be installed. |
| Browser / simulator / physical device | **Not run.** No native or web runtime success claimed. |
| Slush handoff on device | **Not run.** Route follows official documentation; device behavior still needs testing. |
| Testnet transactions | **Not run.** Existing Move deployment requirements still apply. |

The original app's dependencies were installed outside the preceding agent turn. Its baseline type check exposed two SDK identity errors: the root pin was `@mysten/sui` 2.39.0 while the installed dApp Kit core required 2.39.1. Root `package.json` is now aligned to 2.39.1 with an override, but offline lockfile regeneration failed with `ENOTCACHED`. The existing root lockfile was preserved; **run `npm install` in `mobile-tokenization-app/` to regenerate it before using `npm ci` or claiming the legacy build passes.** The mobile app has its own SDK 2.39.1 pin/override and needs its own successful installation.

Next: install dependencies in a network-enabled terminal, retain the generated locks, run the commands in README, host the Expo web export, set its public URL, then test native wallet handoff and a real Testnet purchase receipt. No App Store, Play Store, EAS or Mainnet action was performed.
