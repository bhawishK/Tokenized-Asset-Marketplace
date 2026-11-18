export type FundingState = {
  configured: boolean;
  connected: boolean;
  wrongNetwork: boolean;
  serviceReady: boolean;
  working: boolean;
  otherActionPending: boolean;
};

export function fundingBlockReason(state: FundingState): string | null {
  if (state.working) return 'A funding request is already in progress. Check Slush for an approval message.';
  if (!state.configured) return 'The app needs its Testnet deployment configuration.';
  if (!state.connected) return 'Slush has not supplied an active account yet. Use Connect wallet above.';
  if (state.wrongNetwork) return 'The connected wallet account does not support Sui Testnet. Select Testnet in Slush, then reconnect if needed.';
  if (!state.serviceReady) return 'Waiting for the local funding service. The app retries automatically; you can also select Retry funding connection.';
  if (state.otherActionPending) return 'Another wallet action is pending. Finish or cancel it in Slush first.';
  return null;
}
