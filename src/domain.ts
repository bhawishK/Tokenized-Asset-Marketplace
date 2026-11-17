export const UNIT = 1_000_000n;
export const DEMO_PRICE = 100n;
export const U64_MAX = 18_446_744_073_709_551_615n;

export function parseUnits(input: string): bigint {
  if (!/^(0|[1-9]\d{0,13})(\.\d{1,6})?$/.test(input)) throw new Error('Enter a positive amount with up to 6 decimal places.');
  const [whole, fraction = ''] = input.split('.');
  const value = BigInt(whole) * UNIT + BigInt(fraction.padEnd(6, '0'));
  if (value <= 0n || value > U64_MAX) throw new Error('Amount is outside the supported range.');
  return value;
}
export function formatUnits(value: bigint): string {
  const sign = value < 0n ? '−' : '';
  const abs = value < 0n ? -value : value;
  const fraction = (abs % UNIT).toString().padStart(6, '0').replace(/0+$/, '');
  return `${sign}${(abs / UNIT).toLocaleString('en-US')}${fraction ? `.${fraction}` : ''}`;
}
export function costOf(quantity: bigint, price: bigint): bigint {
  if (quantity <= 0n || price <= 0n || quantity > U64_MAX / price) throw new Error('Quantity is outside the supported range.');
  return quantity * price;
}
export function purchaseIssue(quantity: bigint, price: bigint, usd: bigint, stock: bigint): string | null {
  let cost: bigint;
  try { cost = costOf(quantity, price); } catch { return 'Enter a valid purchase quantity.'; }
  if (usd < cost) return `Insufficient MockUSD. You need ${formatUnits(cost - usd)} more mUSD.`;
  if (stock < quantity) return 'This quantity exceeds marketplace inventory.';
  return null;
}
export function validAddress(value: string): boolean { return /^0x[0-9a-fA-F]{64}$/.test(value) && !/^0x0+$/.test(value); }
export function short(value: string): string { return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value; }
export function explorer(digest: string): string { return `https://suivision.xyz/txblock/${encodeURIComponent(digest)}?network=testnet`; }

export type Movement = { coinType: string; address: string; amount: string };
export function assetDelta(changes: Movement[], address: string, type: string): bigint {
  return changes.filter(c => c.address.toLowerCase() === address.toLowerCase() && c.coinType === type).reduce((sum, c) => sum + BigInt(c.amount), 0n);
}
export function verifySettlement(changes: Movement[], buyer: string, seller: string, usdType: string, goldType: string, quantity: bigint, paid: bigint): boolean {
  return buyer.toLowerCase() !== seller.toLowerCase()
    && assetDelta(changes, buyer, usdType) === -paid
    && assetDelta(changes, seller, usdType) === paid
    && assetDelta(changes, buyer, goldType) === quantity;
}
