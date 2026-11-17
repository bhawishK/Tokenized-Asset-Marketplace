# Expo migration validation

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
