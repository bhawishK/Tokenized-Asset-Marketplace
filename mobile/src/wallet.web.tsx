import { createContext, useContext } from 'react';
import { createDAppKit, DAppKitProvider, useCurrentAccount, useDAppKit } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import type { WalletState, ProviderProps } from './wallet.types';

// Keep browser custom elements and wallet discovery out of the native bundle.
const kit = createDAppKit({ networks: ['testnet'], createClient: () => new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://fullnode.testnet.sui.io:443' }) });
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
      const result = await dapp.signAndExecuteTransaction({ transaction });
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
export function WalletControl() { return <ConnectButton />; }
