# Gold - Expo for iOS, Android and web

The Expo migration shares React Native screens across all three platforms. It reuses the existing Move contracts, exact integer amount rules and chain API. The original Vite interface remains available at `../` while this migration is validated.

**Status, 2026-11-18:** simplified to Buy Gold, Portfolio and Account. All 39 local tests, the Expo type check, web export and Android JavaScript export pass. All three default views were server-rendered with fixture wallet/config adapters to check navigation and content placement. Interactive browser/device verification is still required; the computer-use pipe was unavailable. See [VALIDATION.md](VALIDATION.md).

## Three tabs

- **Buy Gold:** price, inventory, quantity and one purchase action.
- **Portfolio:** balances and recent activity; transfer, redemption and digest lookup expand when needed.
- **Account:** wallet, Testnet SUI, demo MockUSD, sample mode and collapsed issuer tools.

The interface follows system light/dark appearance. Sample activity and Testnet transactions remain explicitly distinguished. See [design notes](../docs/DESIGN.md).

## Start on the web

**With automatic buyer funding:** run `npm.cmd run demo` from the parent repository root. The website gets the buyer address from Slush and offers **Get 250 demo MockUSD**. No address is needed in chat or PowerShell. The service uses the local issuer CLI account, never browser-held issuer keys. See [the funding guide](../docs/DEMO_FUNDING.md). The commands below start the web interface alone.

Use Node 24.3+ in the repository's `mobile-tokenization-app/mobile/` directory:

```powershell
cd "D:\Coding\Gold Tokenization\mobile-tokenization-app\mobile"
npm.cmd ci
npm.cmd --prefix .. run configure:demo
npm.cmd run web
```

This runs the **Expo web app**, normally at `http://localhost:8081`. It is the same React Native screen tree as the native app, rendered with React Native Web. Vite is not needed to run this version.

Without deployment IDs, open **Account > Try sample mode**. Sample purchases, transfers and redemption requests update session-only state, clearly labeled as sample. They never generate transaction digests. After installation, retain the generated `mobile/package-lock.json`; subsequent clean installs should use `npm ci`.

## Phone QR codes and startup

`npm run demo` starts the website on localhost and is intended for the same computer. A phone cannot reach the computer using its own localhost address. For a phone-compatible development build already installed on the device, run `npm.cmd run start:device -- --port 8082` from mobile/, keep both devices on the same Wi-Fi, and scan that terminal QR. `npm.cmd run start:go -- --port 8082` explicitly targets Expo Go but still requires an SDK-compatible Expo Go installation. Merely starting Metro does not install a native runtime.

For a quick Safari UI preview, use the HTTP LAN address shown by the server, rather than the exp:// QR URL. The issuer funding service remains loopback-only; LAN web preview is not a fully hosted wallet/funding deployment.

## Run on a phone or emulator

This app pins **Expo SDK 58**, React Native 0.88.1 and React 19.3.0, following Expo's official SDK matrix and SDK 58 package versions. It includes `expo-dev-client` for development builds. The App Store iPhone version of Expo Go currently supports SDK 54, not this SDK 58 project. Installing that app and scanning a QR cannot load this project. Use a compatible development build (or a compatible Expo Go build distributed through TestFlight); physical iPhone distribution requires the applicable Apple signing setup. See [Expo compatibility guidance](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/).

```powershell
# Android: needs an Android SDK/JDK and an emulator or USB-connected device.
npm.cmd run android

# Later sessions, once the development build is installed:
npm.cmd start
```

On **macOS with Xcode**, `npm run ios` builds/runs the iOS development client. Windows cannot build an iOS binary locally. A physical iPhone also requires Apple's applicable signing/provisioning setup.

Cloud builds are optional and require your own Expo/EAS account and, for iOS device distribution, Apple signing access. No remote build or store submission has been started:

```powershell
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --profile development --platform android
# Or, with Apple signing configured:
npx eas-cli build --profile development --platform ios
```

Keep `mobile-tokenization-app/` and `mobile/` in the same Git repository so EAS includes the shared files above the mobile project directory. `eas.json` also provides an internal preview APK profile and a production profile. Choose your own unique bundle/package identifiers before distributing the app; the defaults identify a university demo.

## iPhone wallet limitations

Slush supports iOS, but Safari does not receive a desktop wallet extension merely because the Slush app is installed. dApp Kit already registers the Slush web-wallet fallback; the app now names that connection explicitly as Gold Testnet Demo. Use the Slush web wallet or the documented Slush app-browser handoff with a public HTTPS app URL. The current HTTP LAN server is a UI preview, not a verified phone purchase deployment. The local MockUSD funding service is loopback-only and cannot be reached from the phone. Do not expose the issuer service publicly to work around that restriction; a hosted buyer-funding design is still needed. Native Expo remains read-only with an external signing handoff. No successful iPhone wallet connection or purchase has been verified.

Official reference: https://sdk.mystenlabs.com/slush-wallet/dapp

## Wallet behavior: explicit platform boundaries

| Capability | Expo web | Native iOS / Android |
| --- | --- | --- |
| Buy Gold, Portfolio and Account screens | Yes | Yes |
| Sample purchase/transfer/redemption rehearsal | Yes | Yes |
| Network balances and inventory | Connected wallet | Public watch address; read-only |
| Purchase, transfer, surrender and issuer signing | dApp Kit / Wallet Standard | Open the hosted Expo web app in Slush's app browser, then connect and approve there |
| Confirmed digest lookup and explorer receipts | Yes | Yes |

The native app **does not pretend to connect or sign using a pasted address**. It labels that address as watched. Wallet Standard browser components are confined to `wallet.web.tsx`; they are not imported into the native bundle. `wallet.tsx` provides the native read-only account adapter.

For a mobile purchase:

1. Enter the public Testnet buyer address under **Account > Wallet**.
2. Review the desired quantity. The native review screen explains the handoff.
3. Continue in Slush. The wallet browser opens this app's **hosted Expo web version**.
4. Connect the intended account, choose Testnet, enter the quantity again, review it and confirm in the wallet.
5. Inspect the confirmed receipt there. Return to the native app to refresh balances or paste the digest into **Portfolio > Verify a transaction**.

The handoff currently opens the app's base URL; it does **not** transfer a pre-authorized transaction or quantity. It has no automatic signed-result callback and never marks a purchase successful because a URL opened. Native state refreshes when the app returns to the foreground, and manual refresh is available. Native receipt verification reads effects directly from Testnet.

This is an external-wallet-browser integration, **not direct native in-app signing or an embedded wallet**. An embedded sign-in wallet would require choosing and configuring a native-capable provider, secure session storage and its transaction authorization flow. That is intentionally not fabricated here.

## Public configuration

```dotenv
EXPO_PUBLIC_PACKAGE_ID=0xYOUR_64_HEX_TESTNET_PACKAGE_ID
EXPO_PUBLIC_MARKETPLACE_ID=0xYOUR_64_HEX_SHARED_MARKETPLACE_ID
EXPO_PUBLIC_WEB_APP_URL=https://your-hosted-expo-web-app.example/
```

Use the same package and marketplace as the original app; **no contract redeployment is required for this UI migration**. The existing [contract README](../README.md) documents publishing, seeding, permissions and the on-chain demo proof.

The web URL must point to **this Expo web app**, not the original Vite interface. Only public HTTPS URLs without credentials, a query or a fragment are accepted for handoff. Configure a public URL reachable by the phone; device `localhost` refers to the phone itself.

`app.config.cjs` exposes these public values through `expo-constants`. Never place secrets in Expo config or `EXPO_PUBLIC_*` variables. Restart Expo after configuration changes. Set the same environment values in your build environment before producing native binaries or a web export.

## Validate and export

```powershell
npm.cmd run doctor
npm.cmd run typecheck
npm.cmd test
npm.cmd run build:web
npm.cmd run build:android
npm.cmd run build:ios
```

`build:android` and `build:ios` validate JS bundling through Expo export; they do **not** generate an APK/IPA or prove device behavior. Use native development or EAS builds for binaries. `build:web` produces `dist/`, which can be served by an HTTPS static host. If your hosting provider checks out the whole repository, use `mobile-tokenization-app/mobile` as the build directory while preserving access to `mobile-tokenization-app/src` during the build.

After installation, run `npx expo install --check` before accepting a dependency lockfile. Pins were taken from the official SDK 58 template and bundled-module manifest but could not be installed together in this session. Resolve reported compatibility errors before publishing rather than suppressing them.

Smoke-test all three views on web and a native device. On native, confirm that watched addresses never enable direct issuer signing, invalid configuration explains setup, opening Slush does not produce a success receipt, Testnet balance refresh works on return, and a real purchase digest can be verified. On web, check wallet rejection, wrong network, a successful atomic receipt, insufficient funds, transfer, escrow and issuer completion. Existing Move tests and the atomicity script remain necessary; sample mode is not on-chain proof.

## Structure

```text
mobile-tokenization-app/
  contracts/                 # existing Move package
  src/domain.ts              # shared amounts and settlement matching
  src/marketplace-api.ts     # shared BCS, chain reads and transaction builders
  src/chain.ts               # legacy Vite environment/wallet adapter
  mobile/
    App.tsx                  # Expo root
    src/MarketplaceApp.tsx   # React Native screens for all platforms
    src/wallet.web.tsx       # browser wallet connection and execution
    src/wallet.tsx           # native watch-only adapter
    src/handoff.ts           # Slush app-browser route validation
    src/config.ts            # Expo public configuration
```

Metro watches the shared source directory and resolves the mobile app's dependency versions. The shared API takes injected deployment IDs and contains no Vite/Expo-specific globals. Serialized transaction JSON crosses the web wallet boundary instead of SDK class instances, avoiding private-class identity conflicts between installed SDK copies.

## References checked

- [Expo SDK compatibility matrix](https://docs.expo.dev/versions/latest/)
- [SDK 58 template](https://github.com/expo/expo/blob/sdk-58/templates/expo-template-blank-typescript/package.json) and [module version manifest](https://github.com/expo/expo/blob/sdk-58/packages/expo/bundledNativeModules.json)
- [Expo web development/export](https://docs.expo.dev/workflow/web/) and [app configuration](https://docs.expo.dev/workflow/configuration/)
- [Slush deep linking, including React Native](https://sdk.mystenlabs.com/slush-wallet/deep-linking)
- [Official Sui React wallet integration](https://sdk.mystenlabs.com/dapp-kit/getting-started/react)
