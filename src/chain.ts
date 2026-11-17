import { createDAppKit } from '@mysten/dapp-kit-react';
import { createMarketplaceApi } from './marketplace-api';
export type { MarketState, Activity, Redemption } from './marketplace-api';

const api = createMarketplaceApi({
  packageId: import.meta.env.VITE_PACKAGE_ID ?? '',
  marketplaceId: import.meta.env.VITE_MARKETPLACE_ID ?? '',
});
export const { configured, PACKAGE, MARKET, USD, GOLD, client, readMarket, readWallet, readActivity,
  purchaseTx, transferTx, redeemTx, mintTx, fundTx, completeTx } = api;
export const dAppKit = createDAppKit({ networks: ['testnet'], createClient: () => client });
declare module '@mysten/dapp-kit-react' { interface Register { dAppKit: typeof dAppKit } }
