import Constants from 'expo-constants';
import { createMarketplaceApi } from '../../src/marketplace-api';

const config = Constants.expoConfig?.extra ?? {};
export const webAppUrl = typeof config.webAppUrl === 'string' ? config.webAppUrl : '';
export const api = createMarketplaceApi({
  packageId: typeof config.packageId === 'string' ? config.packageId : '',
  marketplaceId: typeof config.marketplaceId === 'string' ? config.marketplaceId : '',
});
