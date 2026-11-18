import Constants from 'expo-constants';
import { createMarketplaceApi } from '../../src/marketplace-api';

const config = Constants.expoConfig?.extra ?? {};
// Metro inlines EXPO_PUBLIC_* directly. Its cached APP_MANIFEST may still contain
// empty extras even when the current environment contains a valid deployment.
export const webAppUrl = process.env.EXPO_PUBLIC_WEB_APP_URL ?? (typeof config.webAppUrl === 'string' ? config.webAppUrl : '');
export const demoFaucetUrl = process.env.EXPO_PUBLIC_DEMO_FAUCET_URL ?? (typeof config.demoFaucetUrl === 'string' ? config.demoFaucetUrl : 'http://127.0.0.1:8788');
export const api = createMarketplaceApi({
  packageId: process.env.EXPO_PUBLIC_PACKAGE_ID ?? (typeof config.packageId === 'string' ? config.packageId : ''),
  marketplaceId: process.env.EXPO_PUBLIC_MARKETPLACE_ID ?? (typeof config.marketplaceId === 'string' ? config.marketplaceId : ''),
});
