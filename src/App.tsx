import { useCallback, useEffect, useRef, useState } from 'react';
import { useCurrentAccount, useDAppKit } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import type { Transaction } from '@mysten/sui/transactions';
import { client, configured, PACKAGE, MARKET, USD, GOLD, readMarket, readWallet, readActivity, purchaseTx, transferTx, redeemTx, mintTx, fundTx, completeTx } from './chain';
import type { MarketState, Activity, Redemption } from './chain';
import { UNIT, DEMO_PRICE, formatUnits as fmt, parseUnits, costOf, purchaseIssue, validAddress, short, explorer, verifySettlement } from './domain';
import type { Movement } from './domain';

type View = 'Storefront' | 'Portfolio' | 'Issuer dashboard';
type Receipt = { title: string; digest?: string; changes: Movement[]; proof: boolean; sample: boolean; quantity?: bigint; paid?: bigint; buyer?: string; note?: string; failed?: boolean };
const SAMPLE_MARKET = { inventory: 100n * UNIT, price: DEMO_PRICE, proceeds: 'Sample issuer · no on-chain address' };

function Arrow({ diagonal = false }: { diagonal?: boolean }) { return <span aria-hidden="true">{diagonal ? '↗' : '→'}</span>; }
function CoinIcon({ gold = false }: { gold?: boolean }) { return <span className={`coin-icon ${gold ? 'gold' : ''}`} aria-hidden="true">{gold ? 'Au' : '$'}</span>; }

export default function App() {
  const account = useCurrentAccount();
  const kit = useDAppKit();
  const [view, setView] = useState<View>('Storefront');
  const [sample, setSample] = useState(false);
  const [sampleUsd, setSampleUsd] = useState(250n * UNIT);
  const [sampleGold, setSampleGold] = useState(0n);
  const [sampleStock, setSampleStock] = useState(100n * UNIT);
  const [market, setMarket] = useState<MarketState | null>(null);
  const [wallet, setWallet] = useState<{ usd: bigint; gold: bigint; cap: string | null } | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [requests, setRequests] = useState<Redemption[]>([]);
  const [limited, setLimited] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [amount, setAmount] = useState('1');
  const [recipient, setRecipient] = useState('');
  const [mintAmount, setMintAmount] = useState('100');
  const [fundAmount, setFundAmount] = useState('250');
  const [fundAddress, setFundAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [verificationDigest, setVerificationDigest] = useState('');
  const [sampleHistory, setSampleHistory] = useState<string[]>([]);
  const generation = useRef(0);
  const busy = useRef(false);
  const modalRef = useRef<HTMLElement>(null);
  const receiptRef = useRef<HTMLElement>(null);
  const address = account?.address ?? null;
  const wrongNetwork = !!account && !account.chains.includes('sui:testnet');

  const refresh = useCallback(async () => {
    if (!configured || sample) return;
    const token = ++generation.current;
    setLoading(true);
    try {
      const [m, w] = await Promise.all([readMarket(), address ? readWallet(address) : Promise.resolve(null)]);
      if (token !== generation.current) return;
      setMarket(m); setWallet(w); setError('');
      try {
        const h = await readActivity(address);
        if (token === generation.current) { setActivity(h.activity); setRequests(h.requests); setLimited(h.limited); setHistoryError(''); }
      } catch {
        if (token === generation.current) setHistoryError('Recent activity is unavailable. Balances are still read from the network. Retry refresh.');
      }
    } catch (e) {
      if (token === generation.current) { setMarket(null); setWallet(null); setError(`Network read failed: ${message(e)}`); }
    } finally { if (token === generation.current) setLoading(false); }
  }, [address, sample]);

  useEffect(() => {
    setWallet(null); setActivity([]); setRequests([]); setReceipt(null); setConfirm(false); setError(''); setNotice('');
    void refresh();
    return () => { generation.current++; };
  }, [refresh]);

  useEffect(() => { if (receipt) receiptRef.current?.scrollIntoView({ block: 'start' }); }, [receipt]);
  useEffect(() => {
    if (!confirm) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirm(false);
      if (e.key !== 'Tab') return;
      const items = modalRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      if (!items?.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [confirm]);

  const m = sample ? { ...SAMPLE_MARKET, inventory: sampleStock } : market;
  const usd = sample ? sampleUsd : wallet?.usd ?? null;
  const gold = sample ? sampleGold : wallet?.gold ?? null;
  let qty = 0n;
  let inputError = '';
  try { qty = parseUnits(quantity); } catch (e) { inputError = message(e); }
  let cost = 0n;
  try { cost = costOf(qty, m?.price ?? DEMO_PRICE); } catch { /* invalid quantity is displayed below */ }
  const issue = inputError || (m && usd !== null ? purchaseIssue(qty, m.price, usd, m.inventory) : null);
  const canAct = sample || (configured && !!account && !wrongNetwork && !!market && !!wallet);
  const isIssuer = !sample && !!wallet?.cap;

  async function execute(tx: Transaction, title: string, purchase?: { quantity: bigint; paid: bigint }) {
    if (!address || !canAct || sample || busy.current) return;
    busy.current = true;
    const actionGeneration = generation.current;
    setError(''); setNotice(''); setReceipt(null); setPending('Confirm this transaction in your wallet…');
    let digest: string | undefined;
    try {
      tx.setSender(address);
      const result = await kit.signAndExecuteTransaction({ transaction: tx });
      const executed = result.Transaction ?? result.FailedTransaction;
      digest = executed.digest;
      if (actionGeneration !== generation.current) return;
      if (result.FailedTransaction) {
        setReceipt({ title: 'Transaction failed', digest, changes: [], proof: false, sample: false, failed: true, note: result.FailedTransaction.status.error?.message ?? 'Move execution failed. Asset changes are rolled back; gas may be charged.' });
        setError('The transaction failed. No purchase settled. Gas may have been charged.');
        await refresh(); return;
      }
      setPending('Submitted. Waiting for confirmed effects…');
      const confirmed = await client.waitForTransaction({ digest, include: { effects: true, balanceChanges: true, events: true }, timeout: 60_000 });
      if (actionGeneration !== generation.current) return;
      if (confirmed.FailedTransaction) throw new Error(confirmed.FailedTransaction.status.error?.message ?? 'Transaction failed');
      const changes = confirmed.Transaction.balanceChanges;
      const proof = !!purchase && !!market && verifySettlement(changes, address, market.proceeds, USD, GOLD, purchase.quantity, purchase.paid);
      setReceipt({ title, digest, changes, proof, sample: false, quantity: purchase?.quantity, paid: purchase?.paid, buyer: address,
        note: purchase && !proof ? 'Confirmed, but the expected settlement deltas could not be matched. Inspect the explorer effects independently.' : undefined });
      setNotice('Confirmed on Sui Testnet.');
      await refresh();
    } catch (e) {
      if (actionGeneration !== generation.current) return;
      const msg = message(e);
      if (digest) {
        setReceipt({ title: 'Submitted · verification pending', digest, changes: [], proof: false, sample: false, note: 'Confirmation could not be read. Open the explorer or use Verify a transaction below before retrying.' });
        setError('Transaction was submitted; confirmation lookup failed. Do not resubmit until you check its digest.');
      } else setError(/reject|cancel|denied/i.test(msg) ? 'Wallet request rejected. No transaction was submitted.' : msg);
    } finally { busy.current = false; setPending(''); }
  }

  function buy() {
    if (!canAct || issue || busy.current) return;
    setConfirm(false);
    if (sample) {
      setSampleUsd(v => v - cost); setSampleGold(v => v + qty); setSampleStock(v => v - qty);
      setSampleHistory(v => [`Sample purchase · ${fmt(qty)} dGOLD`, ...v]);
      setReceipt({ title: 'Rehearsal purchase complete', changes: [], proof: false, sample: true, quantity: qty, paid: cost, note: 'Browser-only sample. No wallet, transaction digest, or on-chain settlement.' });
      return;
    }
    if (address === market?.proceeds) { setError('Use a distinct buyer account to demonstrate both buyer and seller settlement deltas.'); return; }
    // Pay a full mUSD coin where possible to exercise on-chain change handling.
    const payment = usd !== null && usd >= cost + UNIT ? cost + UNIT : cost;
    void execute(purchaseTx(qty, payment), 'Atomic purchase confirmed', { quantity: qty, paid: cost });
  }

  function portfolioAction(kind: 'transfer' | 'redeem') {
    try {
      const units = parseUnits(amount);
      if (gold === null || units > gold) throw new Error('Insufficient DemoGold.');
      if (kind === 'transfer' && !validAddress(recipient)) throw new Error('Enter a nonzero 0x address with 64 hexadecimal characters.');
      if (sample) {
        setSampleGold(v => v - units); setSampleHistory(v => [`Sample ${kind === 'transfer' ? 'transfer' : 'surrender to escrow'} · ${fmt(units)} dGOLD`, ...v]);
        setNotice(`Sample ${kind === 'transfer' ? 'transfer' : 'redemption request'} recorded in this browser session only.`); return;
      }
      void execute(kind === 'transfer' ? transferTx(units, recipient) : redeemTx(units), kind === 'transfer' ? 'DemoGold transferred' : 'DemoGold surrendered to escrow');
    } catch (e) { setError(message(e)); }
  }

  async function verifyDigest() {
    if (busy.current) return;
    if (!/^[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(verificationDigest.trim())) { setError('Enter a valid Sui transaction digest.'); return; }
    busy.current = true; setPending('Reading transaction effects from Testnet…'); setError('');
    try {
      const digest = verificationDigest.trim();
      const result = await client.getTransaction({ digest, include: { effects: true, balanceChanges: true, events: true } });
      const t = result.Transaction ?? result.FailedTransaction;
      const p = t.events.find(e => e.eventType === `${PACKAGE}::marketplace::Purchase`);
      // Display raw confirmed deltas, even for transfers or failed transactions.
      setReceipt({ title: result.FailedTransaction ? 'Confirmed failed transaction' : 'Confirmed transaction effects', digest, changes: t.balanceChanges, proof: false, sample: false, failed: !!result.FailedTransaction,
        note: p ? 'Purchase event found. Check the asset movements and addresses below.' : 'Inspect these confirmed effects. This transaction may not be an Aurum purchase.' });
    } catch (e) { setError(`Could not read transaction: ${message(e)}`); }
    finally { busy.current = false; setPending(''); }
  }

  const changeView = (v: View) => { setView(v); setError(''); setNotice(''); setConfirm(false); };
  const switchSample = () => { if (pending) return; setSample(v => !v); setReceipt(null); setConfirm(false); };

  return <div className="app">
    <div className="network-strip"><span><i /> Sui Testnet · Simulated assets</span><span>University blockchain project <span className="strip-divider">/</span> No real-world value</span></div>
    <header className="site-header">
      <button className="wordmark" onClick={() => changeView('Storefront')} aria-label="Aurum home"><span className="brand-mark">A</span>aurum<span className="brand-dot">.</span></button>
      <nav aria-label="Main navigation">{(['Storefront', 'Portfolio', 'Issuer dashboard'] as View[]).map(v => <button key={v} className={view === v ? 'active' : ''} onClick={() => changeView(v)}>{v}</button>)}</nav>
      <div className="wallet-control"><ConnectButton /></div>
    </header>
    <main>
      <div className="context-row"><span>THE GOLD STANDARD, REIMAGINED</span><button className="text-button" onClick={switchSample} disabled={!!pending}>{sample ? 'Exit sample rehearsal' : 'Explore a sample rehearsal'} <Arrow diagonal /></button></div>
      {sample && <div className="banner sample-banner"><strong>Sample rehearsal</strong><span>All balances and actions here are browser-only examples. No assets move on Sui.</span><button onClick={switchSample}>Return to Testnet ↗</button></div>}
      {!sample && !configured && <div className="banner setup-banner"><div><strong>Testnet deployment needed</strong><p>Set <code>VITE_PACKAGE_ID</code> and <code>VITE_MARKETPLACE_ID</code> in <code>.env.local</code>, then restart Vite. Follow the README setup guide.</p></div><button onClick={switchSample}>Try the sample interface <Arrow /></button></div>}
      {wrongNetwork && !sample && <div className="banner warning"><strong>Choose Sui Testnet in your wallet.</strong><span>This app signs only for <code>sui:testnet</code>. Mainnet is not supported.</span></div>}
      {view === 'Storefront' && <>
        <section className="hero">
          <div className="hero-copy"><div className="eyebrow"><span className="line" /> ATOMIC SETTLEMENT ON SUI</div><h1>Gold, with<br/>a clear <em>proof.</em></h1><p>Two assets. One transaction.<br/>Exchange simulated dollars for simulated gold, with every movement verifiable on-chain.</p><div className="hero-chips"><span>Move-powered</span><span>Fixed-price exchange</span><span>Testnet only</span></div></div>
          <div className="gold-scene" aria-label="Illustration of simulated Aurum gold bars"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="scene-grid"/><div className="gold-bar bar-back"><span>AURUM</span><b>Au</b><small>DEMO ASSET</small></div><div className="gold-bar bar-front"><span>AURUM</span><b>Au</b><small>SIMULATED GOLD</small><div className="bar-rule"/><small>SUI TESTNET · 001</small></div><span className="scene-label">DIGITAL OWNERSHIP.<br/>VISIBLE SETTLEMENT.</span><span className="scene-cross">+</span></div>
        </section>
        <section className="market-section">
          <div className="market-left"><div className="section-heading"><div><span className="eyebrow">01 / THE MARKETPLACE</span><h2>A little gold.<br/>A complete transaction.</h2></div><span className="status-pill"><i /> {sample ? 'Sample inventory' : market ? 'Network data' : 'Awaiting deployment'}</span></div>
            <div className="stat-grid"><div><span>FIXED EXCHANGE RATE</span><strong>100 <small>mUSD</small></strong><p>per 1 DemoGold</p></div><div><span>AVAILABLE INVENTORY</span><strong>{m ? fmt(m.inventory) : '—'} <small>dGOLD</small></strong><p>{sample ? 'Illustrative balance' : 'Held in the shared marketplace'}</p></div></div>
            <div className="settlement"><span className="settlement-icon">⇄</span><div><strong>Payment and delivery are inseparable.</strong><p>The Move contract settles both assets together. If a purchase fails, neither asset changes hands. Gas may still be charged.</p></div></div>
            <div className="trust-row"><span>01 <b>Connect a Testnet wallet</b></span><span>02 <b>Review & purchase</b></span><span>03 <b>Verify the receipt ↗</b></span></div>
          </div>
          <div className="purchase-card"><div className="card-title"><h3>Purchase DemoGold</h3><span className="mini-badge">{sample ? 'SAMPLE' : 'TESTNET'}</span></div><div className="asset-label"><CoinIcon gold/><div><strong>DemoGold</strong><span>Simulated gold token</span></div><span className="asset-symbol">dGOLD</span></div>
            <label htmlFor="quantity">You receive</label><div className="amount-field"><input id="quantity" inputMode="decimal" value={quantity} onChange={e => { setQuantity(e.target.value); setConfirm(false); }} aria-describedby="purchase-issue"/><span>dGOLD</span></div>
            <div className="presets">{['0.5', '1', '2'].map(n => <button key={n} className={quantity === n ? 'selected' : ''} onClick={() => {setQuantity(n); setConfirm(false);}}>{n} dGOLD</button>)}</div>
            <div className="price-line"><span>You pay</span><strong>{cost > 0n ? fmt(cost) : '—'} <small>mUSD</small></strong></div><div className="balance-line"><span>MockUSD balance</span><span>{usd === null ? 'Connect wallet' : `${fmt(usd)} mUSD`}</span></div>
            {issue && <p className="field-error" id="purchase-issue">{issue}</p>}
            {!sample && !account ? <p className="connect-hint">Connect your wallet above to purchase with Testnet assets.</p> : null}
            <button className="primary" disabled={!canAct || !!issue || !!pending || loading} onClick={() => setConfirm(true)}>{pending ? 'Transaction in progress…' : !configured && !sample ? 'Configure Testnet deployment' : !account && !sample ? 'Connect wallet to purchase' : 'Review purchase'} <Arrow /></button>
            <p className="card-footnote">{sample ? 'Sample interaction only. No wallet signature.' : 'Pay with MockUSD. Network gas is paid in Testnet SUI.'}</p>
          </div>
        </section>
        <section className="proof-section"><div><span className="eyebrow">BUILT TO BE VERIFIED</span><h2>Don’t take the interface<br/>at face value.</h2><p>A successful purchase has one transaction digest. Its confirmed balance changes show MockUSD leaving the buyer, reaching the seller, and DemoGold arriving in the buyer’s wallet.</p></div><div className="proof-steps"><article><span>01</span><div><h3>Price enforced in Move</h3><p>100 MockUSD per DemoGold. The buyer cannot override the price or seller address.</p></div></article><article><span>02</span><div><h3>Inventory, not public minting</h3><p>Your gold comes from issuer-funded inventory. Only an issuer capability can mint.</p></div></article><article><span>03</span><div><h3>One digest. Both movements.</h3><p>Open the receipt in a Testnet explorer and inspect the actual effects.</p></div></article></div></section>
      </>}
      {view === 'Portfolio' && <>
        <section className="page-heading"><span className="eyebrow">02 / YOUR ASSETS</span><h1>Your holdings.<br/><em>Your proof.</em></h1><p>{sample ? 'Illustrative balances for the current sample session.' : address ? `Connected account · ${short(address)}` : 'Connect a Testnet wallet to view balances from the network.'}</p></section>
        <div className="holding-grid"><div className="holding"><CoinIcon/><div><span>MockUSD</span><strong>{usd === null ? '—' : fmt(usd)} <small>mUSD</small></strong></div><span className="mini-badge">6 DECIMALS</span></div><div className="holding"><CoinIcon gold/><div><span>DemoGold</span><strong>{gold === null ? '—' : fmt(gold)} <small>dGOLD</small></strong></div><span className="mini-badge">6 DECIMALS</span></div></div>
        <div className="two-columns"><section className="panel"><span className="eyebrow">MANAGE DEMOGOLD</span><h2>Move your gold.</h2><label htmlFor="asset-amount">Amount in dGOLD</label><input id="asset-amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}/><label htmlFor="recipient">Recipient address · for transfers</label><input id="recipient" value={recipient} onChange={e => setRecipient(e.target.value.trim())} placeholder="0x…" autoComplete="off"/><button className="primary" onClick={() => portfolioAction('transfer')} disabled={!canAct || !!pending}>Transfer DemoGold <Arrow /></button><hr/><h3>Simulated redemption</h3><p>Requesting redemption surrenders your tokens into contract escrow. The issuer can complete the request by burning them. No physical gold or payment is delivered.</p><button className="secondary full" onClick={() => portfolioAction('redeem')} disabled={!canAct || !!pending}>Surrender to escrow <Arrow /></button></section>
        <section className="panel"><span className="eyebrow">ACTIVITY</span><h2>A visible trail.</h2><p className="subtle">{sample ? 'Sample session history · resets on reload' : 'From the latest 50 module events. Includes purchases, app transfers and redemption events. External coin transfers are not indexed here.'}</p>{historyError && <p className="field-error">{historyError}</p>}{sample ? sampleHistory.length ? sampleHistory.map((s, i) => <div className="activity-row" key={i}><span>{s}</span><span className="mini-badge">SAMPLE</span></div>) : <div className="empty-state">Your sample actions will appear here.<br/>Start with a purchase in the storefront.</div> : activity.length ? activity.map((a, i) => <a className="activity-row" key={`${a.digest}-${i}`} href={explorer(a.digest)} target="_blank" rel="noreferrer"><span><strong>{a.kind}</strong><small>{fmt(a.quantity)} dGOLD · {short(a.digest)}</small></span><Arrow diagonal/></a>) : <div className="empty-state">No activity found in the recent event window.<br/>This is not a complete account history.</div>}{limited && <p className="subtle">Older events exist outside this window. Use an explorer for full history.</p>}</section></div>
      </>}
      {view === 'Issuer dashboard' && <>
        <section className="page-heading"><span className="eyebrow">03 / ISSUER OPERATIONS</span><h1>Responsible issuance.<br/><em>Explicit authority.</em></h1><p>Minting and redemption completion require the marketplace’s issuer capability.</p></section>
        <div className={`role-banner ${isIssuer ? 'authorized' : ''}`}><span className="role-icon">{isIssuer ? '✓' : '⊘'}</span><div><strong>{sample ? 'Sample view · no issuer capability' : !account ? 'Connect a wallet to check your role' : isIssuer ? 'Issuer capability verified' : wallet ? 'Viewer access · no issuer capability' : 'Role not verified'}</strong><p>{isIssuer ? `Owned capability · ${short(wallet!.cap!)}` : 'Only the capability holder can mint inventory, fund buyers or complete requests. Move enforces these permissions.'}</p></div></div>
        <div className="issuer-stats"><div><span>Marketplace inventory</span><strong>{m ? `${fmt(m.inventory)} dGOLD` : '—'}</strong></div><div><span>Proceeds recipient · contract-controlled</span><code>{m?.proceeds ?? 'Awaiting deployment'}</code></div></div>
        <div className="two-columns"><section className="panel"><span className="eyebrow">INVENTORY</span><h2>Fund the storefront.</h2><label htmlFor="mint">DemoGold to mint into inventory</label><input id="mint" value={mintAmount} onChange={e => setMintAmount(e.target.value)} inputMode="decimal"/><button className="primary" disabled={!isIssuer || !!pending} onClick={() => {try {void execute(mintTx(wallet!.cap!, parseUnits(mintAmount)), 'Inventory minted');} catch(e){setError(message(e));}}}>Mint inventory <Arrow/></button><hr/><h3>Fund a demo buyer</h3><p>Issuer-only minting. Use a dedicated buyer wallet distinct from the proceeds recipient.</p><label htmlFor="fund-address">Buyer address</label><input id="fund-address" value={fundAddress} onChange={e => setFundAddress(e.target.value.trim())} placeholder="0x…"/><label htmlFor="fund-amount">MockUSD to mint</label><input id="fund-amount" value={fundAmount} onChange={e => setFundAmount(e.target.value)} inputMode="decimal"/><button className="secondary full" disabled={!isIssuer || !!pending} onClick={() => {try {if(!validAddress(fundAddress)) throw new Error('Enter a valid buyer address.'); void execute(fundTx(wallet!.cap!, parseUnits(fundAmount), fundAddress), 'Buyer funded');} catch(e){setError(message(e));}}}>Fund buyer <Arrow/></button></section>
        <section className="panel"><span className="eyebrow">REDEMPTIONS</span><h2>From escrow to burn.</h2><p className="subtle">Requests discovered in the latest 50 module events; current status is fetched from each request object.</p>{historyError && <p className="field-error">{historyError}</p>}{requests.length ? requests.map(r => <div className="request" key={r.id}><div><strong>{fmt(r.quantity)} dGOLD</strong><span className="mini-badge">{r.status === 0 ? 'IN ESCROW' : 'BURNED'}</span></div><p>Holder · {short(r.holder)}</p><a href={`https://suivision.xyz/object/${r.id}?network=testnet`} target="_blank" rel="noreferrer">Request {short(r.id)} ↗</a>{r.status === 0 && <button className="secondary full" disabled={!isIssuer || !!pending} onClick={() => void execute(completeTx(wallet!.cap!, r.id), 'Redemption complete · tokens burned')}>Complete & burn tokens</button>}</div>) : <div className="empty-state">No requests in the recent event window.<br/>Pending requests retain tokens in escrow.</div>}<div className="lifecycle"><span>Holder surrenders</span><b>↓</b><span>Pending · gold in escrow</span><b>↓</b><span>Issuer completes · gold burned</span></div></section></div>
      </>}
      <div className="feedback" aria-live="polite">{loading && <p className="notice">Refreshing Testnet state…</p>}{pending && <p className="notice"><span className="spinner"/>{pending}</p>}{error && <p className="error" role="alert">{error}</p>}{notice && <p className="notice">{notice}</p>}</div>
      {receipt && <section ref={receiptRef} className="receipt" aria-label="Transaction receipt"><div className="receipt-top"><div><span className="eyebrow">{receipt.sample ? 'BROWSER-ONLY EXAMPLE' : 'TRANSACTION RECEIPT'}</span><h2>{receipt.title}</h2></div><button className="text-button" onClick={() => setReceipt(null)}>Close ×</button></div>{receipt.sample && <div className="receipt-movements"><div><span>Sample buyer pays</span><strong>−{fmt(receipt.paid!)} mUSD</strong></div><div><span>Sample buyer receives</span><strong>+{fmt(receipt.quantity!)} dGOLD</strong></div></div>}{receipt.proof && <p className="proof-match">✓ Buyer payment, seller proceeds and buyer gold delivery matched in the confirmed effects of this one transaction.</p>}{receipt.note && <p>{receipt.note}</p>}{receipt.failed && <p className="error">Asset settlement did not complete. If execution occurred, SUI gas may still be charged.</p>}{receipt.digest && <><div className="digest-row"><code>{receipt.digest}</code><a className="secondary" href={explorer(receipt.digest)} target="_blank" rel="noreferrer">Verify on Testnet <Arrow diagonal/></a></div><div className="movement-table"><table><thead><tr><th>Asset</th><th>Address</th><th>Confirmed net change</th></tr></thead><tbody>{receipt.changes.filter(c => c.coinType === USD || c.coinType === GOLD).map((c,i) => <tr key={i}><td>{c.coinType === USD ? 'MockUSD' : 'DemoGold'}</td><td><code title={c.address}>{short(c.address)}</code>{c.address === receipt.buyer ? ' · buyer' : c.address === market?.proceeds ? ' · proceeds' : ''}</td><td>{BigInt(c.amount) > 0n ? '+' : ''}{fmt(BigInt(c.amount))}</td></tr>)}</tbody></table></div><p className="subtle">Rows above come from confirmed transaction balance changes. SUI gas is separate. Inspect all object and balance changes in the explorer.</p><details><summary>Raw confirmed balance changes</summary><pre>{JSON.stringify(receipt.changes, null, 2)}</pre></details></>}</section>}
      <section className="verify-box"><div><span className="eyebrow">INDEPENDENT VERIFICATION</span><h3>Already have a transaction digest?</h3><p>Read its confirmed effects directly from Sui Testnet.</p></div><div className="verify-input"><label className="sr-only" htmlFor="verify">Testnet transaction digest</label><input id="verify" placeholder="Paste a Testnet transaction digest" value={verificationDigest} onChange={e => setVerificationDigest(e.target.value)} /><button className="secondary" onClick={() => void verifyDigest()} disabled={!!pending || sample}>Verify <Arrow diagonal/></button></div></section>
      <div className="bottom-actions"><p>{sample ? 'Sample values · current browser session only' : market ? `Marketplace · ${short(MARKET)}` : 'Network balances appear after deployment configuration.'}</p><button className="text-button" onClick={() => void refresh()} disabled={sample || !configured || loading || !!pending}>Refresh network data ↻</button></div>
    </main>
    <footer><div className="footer-brand">aurum<span>.</span><p>A study in atomic ownership.</p></div><p>Simulated assets. No physical backing, monetary value,<br/>investment offering, or physical redemption.</p><span>BUILT WITH MOVE + SUI<br/>UNIVERSITY PROJECT / TESTNET</span></footer>
    {confirm && <div className="modal-backdrop" onClick={() => setConfirm(false)}><section ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setConfirm(false)} aria-label="Close confirmation">×</button><span className="eyebrow">{sample ? 'SAMPLE REHEARSAL' : 'REVIEW TRANSACTION'}</span><h2 id="confirm-title">One atomic purchase.</h2><div className="review-line"><span>You pay</span><strong>{fmt(cost)} mUSD</strong></div><div className="review-line"><span>You receive</span><strong>{fmt(qty)} dGOLD</strong></div><p>{sample ? 'This only updates sample balances in your browser.' : 'Both movements settle together on Sui Testnet. Any excess MockUSD is returned as change. Your wallet will request confirmation; Testnet SUI pays for gas.'}</p><p className="subtle">Simulated assets with no monetary value or physical backing.</p><button className="primary" onClick={buy} disabled={!!issue || !!pending} autoFocus>{sample ? 'Run sample purchase' : 'Confirm in wallet'} <Arrow/></button><button className="text-button full" onClick={() => setConfirm(false)}>Cancel</button></section></div>}
  </div>;
}

function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
