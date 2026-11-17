module.exports = {
  expo: {
    name: 'Aurum Testnet', slug: 'aurum-testnet', version: '1.0.0', scheme: 'aurum-testnet',
    orientation: 'default', userInterfaceStyle: 'light',
    ios: { supportsTablet: true, bundleIdentifier: 'edu.demo.aurumtestnet' },
    android: { package: 'edu.demo.aurumtestnet' },
    web: { bundler: 'metro', output: 'single', name: 'Aurum — Sui Testnet' },
    extra: {
      packageId: process.env.EXPO_PUBLIC_PACKAGE_ID || '',
      marketplaceId: process.env.EXPO_PUBLIC_MARKETPLACE_ID || '',
      webAppUrl: process.env.EXPO_PUBLIC_WEB_APP_URL || '',
    },
  },
};
