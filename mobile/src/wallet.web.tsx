import { createContext, useContext } from 'react';
import { createDAppKit, DAppKitProvider, useCurrentAccount, useDAppKit } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import type { WalletState, ProviderProps } from './wallet.types';
import { transactionForSigning } from './wallet-transaction';
import { Text, View, useColorScheme } from 'react-native';

// Keep browser custom elements and wallet discovery out of the native bundle.
const kit = createDAppKit({ networks: ['testnet'], slushWalletConfig: { appName: 'Gold Testnet Demo' }, createClient: () => new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://fullnode.testnet.sui.io:443' }) });
const Context = createContext<WalletState | null>(null);
function ConnectedProvider({ children }: ProviderProps) {
  const account = useCurrentAccount();
  const dapp = useDAppKit();
  const value: WalletState = {
    address: account?.address ?? null, native: false,
    wrongNetwork: !!account && !account.chains.includes('sui:testnet'), setWatchAddress: () => {},
    signFundingMessage: async message => {
      const result = await dapp.signPersonalMessage({ message: new TextEncoder().encode(message) });
      return result.signature;
    },
    signAndExecute: async transaction => {
      const result = await dapp.signAndExecuteTransaction({ transaction: transactionForSigning(transaction) });
      const t = result.Transaction ?? result.FailedTransaction;
      return { digest: t.digest, failed: !!result.FailedTransaction, error: result.FailedTransaction?.status.error?.message };
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function WalletProvider({ children }: ProviderProps) {
  return <DAppKitProvider dAppKit={kit}><ConnectedProvider>{children}</ConnectedProvider></DAppKitProvider>;
}
export function useWallet(): WalletState {
  const value = useContext(Context);
  if (!value) throw new Error('WalletProvider is missing.');
  return value;
}
export function WalletControl() {
  const dark = useColorScheme() === 'dark';
  const insecure = typeof window !== 'undefined' && !window.isSecureContext;
  return <View style={{ gap: 12 }}>
    <ConnectButton />
    <Text style={{ color: dark ? '#b0b6c0' : '#59616e', fontSize: 15, lineHeight: 23 }}>
      On iPhone, use the Slush web wallet or open the hosted app in Slush's browser. Installing the wallet app alone does not connect Safari.
    </Text>
    {insecure && <Text accessibilityRole="alert" style={{ color: dark ? '#e4c479' : '#765416', fontSize: 15, lineHeight: 23 }}>
      This HTTP network address is for interface preview. Phone wallet integration needs a secure HTTPS deployment; the local demo funding service is not accessible from this phone.
    </Text>}
  </View>;
}
