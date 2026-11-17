// Native entry. Metro resolves wallet.web.tsx on web, and this file on iOS/Android.
import { createContext, useContext, useState } from 'react';
import type { WalletState, ProviderProps } from './wallet.types';

const Context = createContext<WalletState | null>(null);
export function WalletProvider({ children }: ProviderProps) {
  const [address, setWatchAddress] = useState<string | null>(null);
  const value: WalletState = {
    address, setWatchAddress, wrongNetwork: false, native: true,
    signAndExecute: async () => { throw new Error('Native signing happens in the external wallet browser.'); },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useWallet(): WalletState {
  const value = useContext(Context);
  if (!value) throw new Error('WalletProvider is missing.');
  return value;
}
export function WalletControl() { return null; }
