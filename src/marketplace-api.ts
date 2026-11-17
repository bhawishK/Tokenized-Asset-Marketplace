import { bcs } from '@mysten/sui/bcs';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { validAddress } from './domain';
export type MarketState = { inventory: bigint; price: bigint; proceeds: string };
export type Activity = { digest: string; kind: string; quantity: bigint; request?: string };
export type Redemption = { id: string; holder: string; quantity: bigint; status: number };

// Transport and transaction logic shared by Vite and the Expo migration.
// Configuration is injected so this module never imports Vite or Expo globals.
export function createMarketplaceApi(config: { packageId: string; marketplaceId: string }) {
  const configured = validAddress(config.packageId) && validAddress(config.marketplaceId);
  const PACKAGE = configured ? normalizeSuiAddress(config.packageId) : '';
  const MARKET = configured ? normalizeSuiAddress(config.marketplaceId) : '';
  const USD = PACKAGE + '::mock_usd::MOCK_USD';
  const GOLD = PACKAGE + '::demo_gold::DEMO_GOLD';
  const client = new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://fullnode.testnet.sui.io:443' });
// UID, ID and address each serialize as 32 bytes; Balance<T> as one u64.
const MarketBCS = bcs.struct('Marketplace', { id: bcs.Address, inventory: bcs.u64(), price: bcs.u64(), proceeds: bcs.Address });
const TreasuryBCS = bcs.struct('TreasuryCap', { id: bcs.Address, supply: bcs.u64() });
const CapBCS = bcs.struct('IssuerCap', { id: bcs.Address, marketplace: bcs.Address, usd: TreasuryBCS, gold: TreasuryBCS });
const RequestBCS = bcs.struct('RedemptionRequest', { id: bcs.Address, marketplace: bcs.Address, holder: bcs.Address, quantity: bcs.u64(), escrow: bcs.u64(), status: bcs.u8() });
const PurchaseBCS = bcs.struct('Purchase', { marketplace: bcs.Address, buyer: bcs.Address, quantity: bcs.u64(), amount_paid: bcs.u64() });
const RedemptionBCS = bcs.struct('RedemptionEvent', { marketplace: bcs.Address, request: bcs.Address, holder: bcs.Address, quantity: bcs.u64() });
const TransferBCS = bcs.struct('GoldTransferred', { sender: bcs.Address, recipient: bcs.Address, quantity: bcs.u64() });

async function readMarket(): Promise<MarketState> {
  const { object } = await client.getObject({ objectId: MARKET, include: { content: true } });
  if (object.type !== `${PACKAGE}::marketplace::Marketplace` || object.owner.$kind !== 'Shared') throw new Error('Configured object is not this package’s shared marketplace.');
  const m = MarketBCS.parse(object.content);
  if (BigInt(m.price) !== 100n) throw new Error('Unexpected marketplace price. Check deployment configuration.');
  return { inventory: BigInt(m.inventory), price: BigInt(m.price), proceeds: m.proceeds };
}
async function readWallet(owner: string) {
  const [usd, gold, caps] = await Promise.all([
    client.getBalance({ owner, coinType: USD }), client.getBalance({ owner, coinType: GOLD }),
    client.listOwnedObjects({ owner, type: `${PACKAGE}::marketplace::IssuerCap`, include: { content: true }, limit: 50 }),
  ]);
  const cap = caps.objects.find(o => CapBCS.parse(o.content).marketplace === MARKET);
  return { usd: BigInt(usd.balance.balance), gold: BigInt(gold.balance.balance), cap: cap?.objectId ?? null };
}
async function readActivity(owner: string | null): Promise<{ activity: Activity[]; requests: Redemption[]; limited: boolean }> {
  // Bounded recent module feed. Transparently labeled in the UI; not a full indexer.
  const page = await client.listEvents({ filter: { emitModule: `${PACKAGE}::marketplace` }, order: 'descending', limit: 50 });
  const activity: Activity[] = [];
  const requestIds = new Set<string>();
  for (const event of page.events) {
    const kind = event.eventType.split('::').at(-1);
    if (kind === 'Purchase') {
      const p = PurchaseBCS.parse(event.bcs);
      if (p.marketplace === MARKET && p.buyer === owner) activity.push({ digest: event.transactionDigest, kind: 'Purchase', quantity: BigInt(p.quantity) });
    } else if (kind === 'GoldTransferred') {
      const p = TransferBCS.parse(event.bcs);
      if (p.sender === owner || p.recipient === owner) activity.push({ digest: event.transactionDigest, kind: p.sender === owner ? 'Transfer sent' : 'Transfer received', quantity: BigInt(p.quantity) });
    } else if (kind === 'RedemptionRequested' || kind === 'RedemptionCompleted') {
      const p = RedemptionBCS.parse(event.bcs);
      if (p.marketplace !== MARKET) continue;
      requestIds.add(p.request);
      if (p.holder === owner) activity.push({ digest: event.transactionDigest, kind: kind === 'RedemptionRequested' ? 'Surrendered to escrow' : 'Redemption burned', quantity: BigInt(p.quantity), request: p.request });
    }
  }
  const requests = await Promise.all([...requestIds].map(async id => {
    const { object } = await client.getObject({ objectId: id, include: { content: true } });
    const p = RequestBCS.parse(object.content);
    return { id, holder: p.holder, quantity: BigInt(p.quantity), status: p.status };
  }));
  return { activity, requests, limited: page.hasNextPage };
}
function purchaseTx(quantity: bigint, payment: bigint) {
  const tx = new Transaction();
  tx.moveCall({ target: `${PACKAGE}::marketplace::purchase`, arguments: [tx.object(MARKET), coinWithBalance({ type: USD, balance: payment, useGasCoin: false }), tx.pure.u64(quantity)] });
  return tx;
}
function transferTx(quantity: bigint, recipient: string) {
  const tx = new Transaction();
  tx.moveCall({ target: `${PACKAGE}::marketplace::transfer_gold`, arguments: [coinWithBalance({ type: GOLD, balance: quantity, useGasCoin: false }), tx.pure.address(recipient)] });
  return tx;
}
function redeemTx(quantity: bigint) {
  const tx = new Transaction();
  tx.moveCall({ target: `${PACKAGE}::marketplace::request_redemption`, arguments: [tx.object(MARKET), coinWithBalance({ type: GOLD, balance: quantity, useGasCoin: false })] });
  return tx;
}
function mintTx(cap: string, quantity: bigint) {
  const tx = new Transaction();
  tx.moveCall({ target: `${PACKAGE}::marketplace::mint_inventory`, arguments: [tx.object(cap), tx.object(MARKET), tx.pure.u64(quantity)] });
  return tx;
}
function fundTx(cap: string, amount: bigint, buyer: string) {
  const tx = new Transaction();
  tx.moveCall({ target: `${PACKAGE}::marketplace::fund_buyer`, arguments: [tx.object(cap), tx.pure.u64(amount), tx.pure.address(buyer)] });
  return tx;
}
function completeTx(cap: string, request: string) {
  const tx = new Transaction();
  tx.moveCall({ target: `${PACKAGE}::marketplace::complete_redemption`, arguments: [tx.object(cap), tx.object(request)] });
  return tx;
}

return { configured, PACKAGE, MARKET, USD, GOLD, client, readMarket, readWallet, readActivity, purchaseTx, transferTx, redeemTx, mintTx, fundTx, completeTx };
}
