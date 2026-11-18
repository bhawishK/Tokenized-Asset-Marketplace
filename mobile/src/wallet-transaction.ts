import { Transaction } from '@mysten/sui/transactions';

// Preserve the SDK coin intent across the serialized platform boundary.
// dApp Kit supplies the sender and resolves it with its connected Testnet client.
export function serializeForWallet(transaction: Transaction): Promise<string> {
  return transaction.toJSON({ supportedIntents: ['CoinWithBalance'] });
}
export function transactionForSigning(serialized: string): Transaction {
  return Transaction.from(serialized);
}
