import type { PropsWithChildren } from 'react';

export type WalletState = {
  address: string | null;
  wrongNetwork: boolean;
  native: boolean;
  setWatchAddress: (address: string) => void;
  // Serialized PTB crosses the platform boundary; SDK instances do not.
  signAndExecute: (transaction: string) => Promise<{ digest: string; failed: boolean; error?: string }>;
};
export type ProviderProps = PropsWithChildren;
