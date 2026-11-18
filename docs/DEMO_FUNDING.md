# Funding from the connected wallet

Buyers no longer need to send their address to the assistant or assign PowerShell variables. The web app reads the address from Slush and requests demo funds directly.

## Start once

From the **repository root**, in your normal network-enabled terminal:

```powershell
cd "D:\Coding\Gold Tokenization\mobile-tokenization-app"
npm.cmd run demo
```

Keep that terminal running. This starts a local Testnet issuer service and the Expo web app at `http://localhost:8081`. If a web server is already running there, it is preserved; reload the existing Gold tab. If that port belongs to a different app, stop that app and run the app's `npm run web` from `mobile/`.

The service requires the existing issuer CLI account to be active. It checks the deployed issuer address and always invokes the CLI with `--client.env testnet`. No new wallet is created, and no private key is copied out of the user's CLI keystore. If you changed the active account, switch back to the issuer shown in `deployments/testnet.json` before starting. The issuer needs faucet SUI for setup/funding gas.

On first start, the service reads marketplace inventory. Existing inventory is preserved. An empty, unprepared marketplace is seeded **once with 100 DemoGold** through the issuer capability. The persistent preparation record prevents automatic replenishment on later restarts or after a sellout.

## Buyer flow

1. Exit sample mode and connect your separate Slush buyer wallet on Testnet.
2. Open **Account > Demo funds** and click **Get 250 demo MockUSD**.
3. Approve the message in Slush. It identifies the wallet, site origin, deployment, fixed amount, expiry and a random challenge. It does not authorize a purchase or spend buyer assets.
4. The service verifies ownership, submits `fund_buyer` with the issuer capability, waits for confirmation and checks a **250 MockUSD** credit to that buyer in transaction balance changes.
5. The app shows the funding digest and refreshes balances. A separate public SUI faucet request is attempted automatically for the buyer's gas. Faucet acceptance is not a promise of immediate delivery; use the SUI faucet link if rate limits prevent it.
6. Review and approve a normal purchase. Its digest, separate from the funding digest, is the evidence of atomic MockUSD payment and DemoGold delivery.

## Boundaries

- The service binds only to `127.0.0.1:8788` and allows the local Expo origins. `DEMO_FAUCET_ORIGIN` may specify another trusted development origin. Host and Origin checks reject unrelated sites; POSTs require JSON.
- Wallet signatures are verified against the requested address. Challenges are origin/address bound, expire after two minutes and are consumed once. A caller cannot choose the amount, token, contract, capability or proceeds recipient.
- Each buyer gets one claim in the service's persistent record, with **100 total reserved claims**. The issuer cannot claim as a buyer. This is a local service limit, not an on-chain sybil-resistant faucet or a production abuse guarantee.
- Claims and preparation reservations are saved **before** signing. Concurrent requests are serialized. Pending/uncertain transactions are not automatically repeated, including after restart. If a response is lost, inspect the recorded digest or issuer transaction history first.
- Local state is in ignored `.demo-faucet/claims.json`. It contains public addresses, statuses and transaction digests, not keys, signatures or recovery phrases. Do not delete it to bypass quotas or retry an uncertain transaction.
- Existing issuer capability permissions remain enforced in Move. There is no public client-side mint authority and no contract upgrade/republication in this change.
- This is a **local development service**. It is not a publicly hosted faucet. Native wallet-browser use on another device needs a reachable hosted deployment and a separately designed hosted funding service or pre-funded on-chain faucet. Never expose an issuer keystore in a frontend bundle.

## Configuration

The Expo app defaults to `http://127.0.0.1:8788`. `EXPO_PUBLIC_DEMO_FAUCET_URL` can change the public endpoint. `SUI_BIN` and `SUI_CLIENT_CONFIG` are server-side paths for a nonstandard local CLI installation/configuration; they must never be `EXPO_PUBLIC_*` variables.

To run the service separately from an already running website:

```powershell
npm.cmd run demo:funding
```

Read-only local setup check (no port bound, no inventory minted and no funding transaction submitted):

```powershell
node scripts/demo-faucet.mjs --check
```

## Validation

Automated tests use real in-memory wallet signatures and a fake on-chain submission adapter. They cover fixed amounts, ownership, origins, expiry, replay, concurrent claims, persistent limits, uncertain submissions and one-time inventory preparation. These are service behavior tests, not live Testnet claim evidence. The local persistent record contains one confirmed claim; this is service-record evidence, not a purchase proof. A successful real purchase digest and iPhone wallet flow remain unverified.
