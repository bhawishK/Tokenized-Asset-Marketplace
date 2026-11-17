import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WalletProvider } from './src/wallet';
import { MarketplaceApp } from './src/MarketplaceApp';

export default function App() {
  return <SafeAreaProvider><WalletProvider><MarketplaceApp /></WalletProvider></SafeAreaProvider>;
}
