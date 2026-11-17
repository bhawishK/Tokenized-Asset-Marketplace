const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Reuse the existing TypeScript core rather than copying contract logic.
config.watchFolders = [path.resolve(__dirname, '..')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules'), path.resolve(__dirname, '../node_modules')];
config.resolver.disableHierarchicalLookup = true;
// Shared files resolve this app's pinned SDK, even when the legacy app is installed.
config.resolver.extraNodeModules = {
  react: path.resolve(__dirname, 'node_modules/react'),
  'react-native': path.resolve(__dirname, 'node_modules/react-native'),
  '@mysten/sui': path.resolve(__dirname, 'node_modules/@mysten/sui'),
};
module.exports = config;
