import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { PropsWithChildren } from 'react';
import type { Activity, MarketState, Redemption } from '../../src/marketplace-api';
import { UNIT, DEMO_PRICE, costOf, explorer, formatUnits as fmt, parseUnits, purchaseIssue, short, validAddress, verifySettlement } from '../../src/domain';
import type { Movement } from '../../src/domain';
import { api, webAppUrl } from './config';
import { useWallet, WalletControl } from './wallet';
import { slushBrowserUrl } from './handoff';

type Tab = 'Storefront' | 'Portfolio' | 'Issuer';
type WalletData = Awaited<ReturnType<typeof api.readWallet>>;
type Receipt = { title: string; digest?: string; changes: Movement[]; sample?: boolean; matched?: boolean; note?: string };

export function MarketplaceApp() {
  const wallet = useWallet();
  const { width } = useWindowDimensions();
  const wide = width >= 850;
  const [tab, setTab] = useState<Tab>('Storefront');
  const [sample, setSample] = useState(false);
  const [demo, setDemo] = useState({ usd: 250n * UNIT, gold: 0n, stock: 100n * UNIT });
  const [market, setMarket] = useState<MarketState | null>(null);
  const [balances, setBalances] = useState<WalletData | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [requests, setRequests] = useState<Redemption[]>([]);
  const [historyNote, setHistoryNote] = useState('');
  const [sampleHistory, setSampleHistory] = useState<string[]>([]);
  const [quantity, setQuantity] = useState('1');
  const [amount, setAmount] = useState('1');
  const [recipient, setRecipient] = useState('');
  const [watchInput, setWatchInput] = useState('');
  const [mintAmount, setMintAmount] = useState('100');
  const [fundAmount, setFundAmount] = useState('250');
  const [fundAddress, setFundAddress] = useState('');
  const [digestInput, setDigestInput] = useState('');
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [review, setReview] = useState(false);
  const busy = useRef(false);
  const generation = useRef(0);
  const scroll = useRef<ScrollView>(null);
  const address = wallet.address;

  const refresh = useCallback(async () => {
    if (sample || !api.configured) return;
    const id = ++generation.current;
    setLoading(true);
    try {
      const [m, b] = await Promise.all([api.readMarket(), address ? api.readWallet(address) : Promise.resolve(null)]);
      if (generation.current !== id) return;
      setMarket(m); setBalances(b);
      try {
        const h = await api.readActivity(address);
        if (generation.current !== id) return;
        setActivity(h.activity); setRequests(h.requests);
        setHistoryNote(h.limited ? 'Recent event window only. Older activity may exist; see the explorer.' : 'Latest module events only; external coin transfers are not indexed here.');
      } catch {
        if (generation.current === id) { setActivity([]); setRequests([]); setHistoryNote('Activity lookup unavailable. Balances were read from the network.'); }
      }
    } catch (e) {
      if (generation.current === id) { setMarket(null); setBalances(null); setError(`Network read failed: ${message(e)}`); }
    } finally { if (generation.current === id) setLoading(false); }
  }, [address, sample]);

  useEffect(() => {
    setBalances(null); setActivity([]); setRequests([]); setReceipt(null); setReview(false); setError(''); setNotice('');
    void refresh();
    return () => { generation.current++; };
  }, [refresh]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state === 'active' && !busy.current) void refresh(); });
    return () => subscription.remove();
  }, [refresh]);
  useEffect(() => { if (receipt) scroll.current?.scrollTo({ y: 0, animated: false }); }, [receipt]);

  const m = sample ? { inventory: demo.stock, price: DEMO_PRICE, proceeds: 'Sample issuer' } : market;
  const usd = sample ? demo.usd : balances?.usd ?? null;
  const gold = sample ? demo.gold : balances?.gold ?? null;
  let units = 0n, cost = 0n, issue = '';
  try { units = parseUnits(quantity); cost = costOf(units, m?.price ?? DEMO_PRICE); }
  catch (e) { issue = message(e); }
  if (!issue && usd !== null && m) issue = purchaseIssue(units, m.price, usd, m.inventory) ?? '';
  const liveReady = api.configured && !!address && !!balances && !!market && !wallet.wrongNetwork;
  const canSign = liveReady && !wallet.native && !sample;
  const issuer = canSign && !!balances?.cap;

  async function openWalletBrowser() {
    try {
      setError('');
      await Linking.openURL(slushBrowserUrl(webAppUrl));
      setNotice('Opened the wallet browser. Connect the intended Testnet account and review your action there. Opening a link does not submit a transaction. Return here and refresh to read updated balances.');
    } catch (e) { setError(message(e)); }
  }
  async function execute(build: () => Promise<string>, title: string, purchase?: { units: bigint; cost: bigint }) {
    if (!canSign || !address || busy.current) return;
    busy.current = true;
    const token = generation.current;
    let digest: string | undefined;
    setError(''); setNotice(''); setReceipt(null); setPending('Confirm in your Testnet wallet…');
    try {
      const result = await wallet.signAndExecute(await build());
      digest = result.digest;
      if (token !== generation.current) return;
      setPending('Submitted. Reading confirmed effects…');
      const resultOnChain = await api.client.waitForTransaction({ digest, include: { effects: true, balanceChanges: true, events: true }, timeout: 60_000 });
      if (token !== generation.current) return;
      const t = resultOnChain.Transaction ?? resultOnChain.FailedTransaction;
      if (resultOnChain.FailedTransaction || result.failed) {
        setReceipt({ title: 'Transaction failed', digest, changes: t.balanceChanges, note: 'Asset settlement aborted. SUI gas may still be charged. Inspect the confirmed effects.' });
      } else {
        const matched = !!purchase && !!market && verifySettlement(t.balanceChanges, address, market.proceeds, api.USD, api.GOLD, purchase.units, purchase.cost);
        setReceipt({ title, digest, changes: t.balanceChanges, matched, note: purchase && !matched ? 'Confirmed, but expected settlement deltas were not matched. Inspect the full effects.' : undefined });
      }
      await refresh();
    } catch (e) {
      if (token !== generation.current) return;
      if (digest) setReceipt({ title: 'Submitted · confirmation not yet verified', digest, changes: [], note: 'Check this digest before retrying; a failed lookup does not mean the transaction failed.' });
      setError(digest ? 'Confirmation lookup failed. Check the submitted digest before retrying.' : /reject|cancel|denied/i.test(message(e)) ? 'Wallet request rejected; nothing was submitted.' : message(e));
    } finally { busy.current = false; setPending(''); }
  }
  function purchase() {
    setReview(false);
    if (issue || busy.current) return;
    if (sample) {
      setDemo(d => ({ usd: d.usd - cost, gold: d.gold + units, stock: d.stock - units }));
      setSampleHistory(h => [`Purchase · ${fmt(units)} dGOLD`, ...h]);
      setReceipt({ title: 'Sample purchase complete', changes: [], sample: true, note: `Sample buyer paid ${fmt(cost)} mUSD and received ${fmt(units)} dGOLD. Browser/app session only; no transaction was submitted.` });
    } else if (wallet.native) void openWalletBrowser();
    else if (address === market?.proceeds) setError('Use a buyer distinct from the proceeds recipient for the atomic settlement demo.');
    else {
      const payment = usd !== null && usd >= cost + UNIT ? cost + UNIT : cost;
      void execute(async () => api.purchaseTx(units, payment).toJSON(), 'Atomic purchase confirmed', { units, cost });
    }
  }
  function act(kind: 'transfer' | 'redeem') {
    try {
      const n = parseUnits(amount);
      if (gold === null || n > gold) throw new Error('Insufficient DemoGold.');
      if (kind === 'transfer' && !validAddress(recipient)) throw new Error('Enter a full, nonzero Sui recipient address.');
      if (sample) {
        setDemo(d => ({ ...d, gold: d.gold - n }));
        setSampleHistory(h => [`${kind === 'transfer' ? 'Transfer' : 'Surrendered to escrow'} · ${fmt(n)} dGOLD`, ...h]);
        setNotice('Sample action recorded in this session only.');
      } else if (wallet.native) void openWalletBrowser();
      else void execute(async () => (kind === 'transfer' ? api.transferTx(n, recipient) : api.redeemTx(n)).toJSON(), kind === 'transfer' ? 'DemoGold transferred' : 'DemoGold surrendered to escrow');
    } catch (e) { setError(message(e)); }
  }
  async function verifyDigest() {
    if (busy.current || sample) return;
    if (!/^[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(digestInput.trim())) { setError('Enter a valid Testnet transaction digest.'); return; }
    busy.current = true; setPending('Reading Testnet transaction…'); setError('');
    try {
      const result = await api.client.getTransaction({ digest: digestInput.trim(), include: { balanceChanges: true, effects: true } });
      const t = result.Transaction ?? result.FailedTransaction;
      setReceipt({ title: result.FailedTransaction ? 'Confirmed failed transaction' : 'Confirmed transaction effects', digest: t.digest, changes: t.balanceChanges, note: 'These are network effects. This lookup alone does not assert that the transaction is an Aurum purchase.' });
    } catch (e) { setError(message(e)); }
    finally { busy.current = false; setPending(''); }
  }
  const safe = (fn: () => void) => { setError(''); try { fn(); } catch (e) { setError(message(e)); } };
  const navigate = (next: Tab) => { setTab(next); setError(''); setNotice(''); };

  return <SafeAreaView style={s.safe} edges={['top', 'left', 'right', 'bottom']}>
    <StatusBar style="dark" />
    <View style={s.network}><Text style={s.networkText}>●  Sui Testnet · Simulated assets</Text><Text style={s.networkSmall}>NO REAL-WORLD VALUE</Text></View>
    <View style={s.header}><Text accessibilityRole="header" style={s.logo}>aurum<Text style={s.goldText}>.</Text></Text><View style={s.wallet}><WalletControl />{wallet.native && <Text style={s.tag}>NATIVE APP</Text>}</View></View>
    <View accessibilityRole="tablist" style={s.tabs}>{(['Storefront', 'Portfolio', 'Issuer'] as Tab[]).map(t => <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} onPress={() => navigate(t)} style={[s.tab, tab === t && s.tabActive]}><Text style={[s.tabText, tab === t && s.tabTextActive]}>{t}</Text></Pressable>)}</View>
    <ScrollView ref={scroll} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <View style={s.container}>
        <View style={s.modeRow}><Text style={s.eyebrow}>ATOMIC OWNERSHIP / SUI</Text><Button text={sample ? 'Exit sample' : 'Try sample'} quiet disabled={!!pending} onPress={() => {setSample(v => !v); setReview(false);}} /></View>
        {sample && <Banner title="Sample rehearsal" text="All balances and actions are illustrative and session-only. No assets move on-chain." />}
        {!sample && !api.configured && <Banner title="Testnet deployment needed" text="Configure the public package and marketplace IDs in mobile/.env.local and restart Expo. You can explore the sample interface now." />}
        {!sample && wallet.wrongNetwork && <Banner title="Select Sui Testnet" text="This app only requests Testnet signatures. Switch to Testnet in the connected wallet." />}
        {!sample && wallet.native && <Panel><Text style={s.sectionTitle}>Watch your Testnet account</Text><Text style={s.copy}>A watched address is read-only, not a connected signer. Purchases and issuer operations are approved in Slush’s app browser using the web version of this app.</Text><Field label="Public Sui address" value={watchInput} onChange={setWatchInput} address /><Button text="Watch address" onPress={() => safe(() => {if (!validAddress(watchInput)) throw new Error('Enter a full nonzero Sui address.'); wallet.setWatchAddress(watchInput.toLowerCase());})} disabled={!api.configured || !!pending} /><Button quiet text="Open app in Slush wallet ↗" onPress={() => void openWalletBrowser()} disabled={!!pending} /></Panel>}
        {loading && <Text accessibilityLiveRegion="polite" style={s.feedback}>Refreshing Testnet state…</Text>}
        {!!pending && <Text accessibilityLiveRegion="polite" style={s.feedback}>{pending}</Text>}
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        {!!notice && <Text accessibilityLiveRegion="polite" style={s.feedback}>{notice}</Text>}
        {receipt && <Panel><Text style={s.eyebrow}>{receipt.sample ? 'SAMPLE / NOT ON-CHAIN' : 'NETWORK RECEIPT'}</Text><Text style={s.sectionTitle}>{receipt.title}</Text>{receipt.matched && <Banner title="Both asset movements verified" text="Buyer payment, seller proceeds and buyer gold delivery matched the confirmed effects under this one digest." />}{receipt.note && <Text style={s.copy}>{receipt.note}</Text>}{receipt.digest && <><Text selectable style={s.code}>{receipt.digest}</Text><Button text="Verify on Testnet explorer ↗" onPress={() => void Linking.openURL(explorer(receipt.digest!)).catch(e => setError(message(e)))} />{receipt.changes.filter(c => c.coinType === api.USD || c.coinType === api.GOLD).map((c,i) => <View style={s.movement} key={i}><Text style={s.body}>{c.coinType === api.USD ? 'MockUSD' : 'DemoGold'} · {short(c.address)}</Text><Text style={s.value}>{BigInt(c.amount) > 0n ? '+' : ''}{fmt(BigInt(c.amount))}</Text></View>)}<Text style={s.small}>Net balance changes from confirmed effects. SUI gas is separate.</Text></>}<Button quiet text="Close receipt" onPress={() => setReceipt(null)} /></Panel>}
        {tab === 'Storefront' && <>
          <View style={[s.hero, wide && s.row]}><View style={s.flex}><Text style={s.eyebrow}>GOLD, SETTLED ATOMICALLY</Text><Text accessibilityRole="header" style={[s.heroTitle, wide && { fontSize: 66, lineHeight: 74 }]}>Gold, with{ '\n' }a clear <Text style={s.goldText}>proof.</Text></Text><Text style={s.heroCopy}>Two assets. One transaction. Exchange simulated dollars for simulated gold, with every movement verifiable on-chain.</Text><Text style={s.small}>Move-powered  ·  Fixed price  ·  Testnet only</Text></View><View style={s.art}><View style={s.barBack} /><View style={s.bar}><Text style={s.barLabel}>A U R U M</Text><Text style={s.au}>Au</Text><Text style={s.barLabel}>SIMULATED GOLD</Text><Text style={s.barLabel}>SUI TESTNET / 001</Text></View></View></View>
          <View style={[s.columns, wide && s.row]}><View style={s.flex}><Text style={s.eyebrow}>01 / THE MARKETPLACE</Text><Text style={s.heading}>A little gold.{ '\n' }A complete transaction.</Text><View style={s.stats}><Stat label="FIXED PRICE" value="100 mUSD" detail="per 1 DemoGold"/><Stat label="INVENTORY" value={m ? `${fmt(m.inventory)} dGOLD` : '—'} detail={sample ? 'Sample inventory' : 'Shared marketplace'}/></View><Panel><Text style={s.sectionTitle}>Payment and delivery are inseparable.</Text><Text style={s.copy}>A purchase moves both assets together. If it aborts, neither asset settles. A transaction that reaches execution may still charge SUI gas.</Text></Panel><Text style={s.small}>1. Review purchase    2. Approve in wallet    3. Verify digest</Text></View>
          <Panel style={wide ? { width: 380 } : undefined}><Text style={s.sectionTitle}>Purchase DemoGold</Text><Text style={s.small}>dGOLD / simulated gold with no physical backing</Text><Field label="You receive · dGOLD" value={quantity} onChange={setQuantity}/><View style={s.presets}>{['0.5', '1', '2'].map(q => <Button key={q} quiet text={`${q} dGOLD`} onPress={() => setQuantity(q)}/>)}</View><View style={s.summaryRow}><Text style={s.body}>You pay</Text><Text style={s.total}>{cost > 0n ? fmt(cost) : '—'} mUSD</Text></View><Text style={s.small}>MockUSD balance: {usd === null ? '—' : `${fmt(usd)} mUSD`}</Text>{!!issue && <Text style={s.fieldError}>{issue}</Text>}<Button text={wallet.native && !sample ? 'Review wallet handoff' : 'Review purchase'} disabled={!!pending || !!issue || loading || (!sample && !liveReady)} onPress={() => setReview(true)} /><Text style={s.small}>{sample ? 'Sample only. No wallet signature.' : wallet.native ? 'Continue in Slush’s browser; review the amount again there.' : !address ? 'Connect a Testnet wallet above.' : 'Gas is paid separately in Testnet SUI.'}</Text></Panel></View>
        </>}
        {tab === 'Portfolio' && <><Text style={s.eyebrow}>02 / YOUR ASSETS</Text><Text accessibilityRole="header" style={s.heading}>Your holdings.{ '\n' }Your proof.</Text><Text style={s.copy}>{sample ? 'Sample balances for this session.' : address ? `${wallet.native ? 'Watching' : 'Connected'} ${short(address)}` : 'Connect a wallet or watch a public address to view network balances.'}</Text><View style={[s.columns, wide && s.row]}><Panel style={s.flex}><Stat label="MOCKUSD" value={usd === null ? '—' : `${fmt(usd)} mUSD`} detail="6 decimals / no monetary value"/></Panel><Panel style={s.flex}><Stat label="DEMOGOLD" value={gold === null ? '—' : `${fmt(gold)} dGOLD`} detail="6 decimals / no physical backing"/></Panel></View><View style={[s.columns, wide && s.row]}><Panel style={s.flex}><Text style={s.sectionTitle}>Move your gold.</Text><Field label="Amount · dGOLD" value={amount} onChange={setAmount}/><Field label="Recipient · for transfers" value={recipient} onChange={setRecipient} address/><Button text={wallet.native && !sample ? 'Transfer in wallet browser ↗' : 'Transfer DemoGold'} disabled={!!pending || (!sample && !liveReady)} onPress={() => act('transfer')}/><Text style={s.sectionTitle}>Simulated redemption</Text><Text style={s.copy}>Surrender DemoGold into contract escrow. Pending tokens are not burned. The issuer completes the request by burning the escrow. No physical delivery or payment occurs.</Text><Button secondary text={wallet.native && !sample ? 'Redeem in wallet browser ↗' : 'Surrender to escrow'} disabled={!!pending || (!sample && !liveReady)} onPress={() => act('redeem')}/></Panel><Panel style={s.flex}><Text style={s.sectionTitle}>A visible trail.</Text><Text style={s.small}>{sample ? 'Sample session history; resets on reload.' : historyNote || 'Recent module events only, not complete account history.'}</Text>{sample ? sampleHistory.length ? sampleHistory.map((h,i) => <Text key={i} style={s.activity}>{h} · SAMPLE</Text>) : <Empty text="Start with a sample purchase."/> : activity.length ? activity.map((a,i) => <Pressable accessibilityRole="link" key={`${a.digest}-${i}`} onPress={() => void Linking.openURL(explorer(a.digest)).catch(e => setError(message(e)))} style={s.activity}><Text style={s.body}>{a.kind} · {fmt(a.quantity)} dGOLD ↗</Text><Text style={s.small}>{short(a.digest)}</Text></Pressable>) : <Empty text="No activity in the current event window."/>}</Panel></View></>}
        {tab === 'Issuer' && <><Text style={s.eyebrow}>03 / ISSUER OPERATIONS</Text><Text accessibilityRole="header" style={s.heading}>Explicit authority.</Text><Banner title={sample ? 'Sample view · no issuer authority' : wallet.native ? balances?.cap ? 'Watched address holds an issuer capability' : 'Read-only issuer view' : issuer ? 'Issuer capability verified' : 'Viewer access'} text={wallet.native ? 'Watching an issuer address grants no signing permission. Use that issuer account in the wallet browser to perform operations.' : 'Move requires the matching issuer capability for minting and redemption completion.'}/><View style={s.stats}><Stat label="INVENTORY" value={m ? `${fmt(m.inventory)} dGOLD` : '—'} detail="Issuer-funded stock"/><View style={s.flex}><Text style={s.eyebrow}>PROCEEDS RECIPIENT</Text><Text selectable style={s.code}>{m?.proceeds ?? 'Awaiting deployment'}</Text></View></View>{wallet.native && !sample && <Button text="Issuer operations in Slush ↗" disabled={!!pending} onPress={() => void openWalletBrowser()}/>}<View style={[s.columns, wide && s.row]}><Panel style={s.flex}><Text style={s.sectionTitle}>Fund the storefront.</Text><Field label="DemoGold to mint into inventory" value={mintAmount} onChange={setMintAmount}/><Button text="Mint inventory" disabled={!issuer || !!pending} onPress={() => safe(() => {const n = parseUnits(mintAmount); void execute(async () => api.mintTx(balances!.cap!, n).toJSON(), 'Inventory minted');})}/><Text style={s.sectionTitle}>Fund a demo buyer</Text><Field label="Buyer address" value={fundAddress} onChange={setFundAddress} address/><Field label="MockUSD to mint" value={fundAmount} onChange={setFundAmount}/><Button secondary text="Fund buyer" disabled={!issuer || !!pending} onPress={() => safe(() => {if (!validAddress(fundAddress)) throw new Error('Enter a valid buyer address.'); const n = parseUnits(fundAmount); void execute(async () => api.fundTx(balances!.cap!, n, fundAddress).toJSON(), 'Buyer funded');})}/></Panel><Panel style={s.flex}><Text style={s.sectionTitle}>From escrow to burn.</Text><Text style={s.copy}>Pending → surrendered in escrow.{ '\n' }Completed → tokens burned, simulation complete.</Text><Text style={s.small}>{historyNote || 'Requests discovered in recent module events. Current statuses are read from request objects.'}</Text>{requests.length ? requests.map(r => <View key={r.id} style={s.request}><Text style={s.value}>{fmt(r.quantity)} dGOLD · {r.status === 0 ? 'IN ESCROW' : 'BURNED'}</Text><Text selectable style={s.small}>Holder {short(r.holder)} · {short(r.id)}</Text>{r.status === 0 && <Button secondary text="Complete and burn" disabled={!issuer || !!pending} onPress={() => void execute(async () => api.completeTx(balances!.cap!, r.id).toJSON(), 'Redemption completed · tokens burned')}/>}</View>) : <Empty text="No requests in this recent event window."/>}</Panel></View></>}
        <Panel><Text style={s.eyebrow}>INDEPENDENT VERIFICATION</Text><Text style={s.sectionTitle}>Have a transaction digest?</Text><Text style={s.copy}>Look up its effects directly on Sui Testnet, including a purchase completed in the wallet browser.</Text><Field label="Testnet transaction digest" value={digestInput} onChange={setDigestInput} address/><Button secondary text="Read confirmed effects" disabled={!!pending || sample} onPress={() => void verifyDigest()}/></Panel>
        <Button quiet text="Refresh network balances and inventory ↻" disabled={sample || !api.configured || loading || !!pending} onPress={() => {setError(''); void refresh();}} />
        <View style={s.footer}><Text style={s.logo}>aurum<Text style={s.goldText}>.</Text></Text><Text style={s.copy}>A study in atomic ownership.{ '\n' }Simulated assets. No physical backing, monetary value or physical redemption.</Text><Text style={s.small}>UNIVERSITY PROJECT / MOVE + SUI</Text></View>
      </View>
    </ScrollView>
    <Modal visible={review} transparent animationType="fade" onRequestClose={() => setReview(false)}><View style={s.overlay}><View accessibilityViewIsModal style={s.modal}><Text style={s.eyebrow}>{sample ? 'SAMPLE REHEARSAL' : wallet.native ? 'WALLET BROWSER HANDOFF' : 'REVIEW PURCHASE'}</Text><Text style={s.heading}>One atomic purchase.</Text><Text style={s.total}>Pay {fmt(cost)} mUSD</Text><Text style={s.total}>Receive {fmt(units)} dGOLD</Text><Text style={s.copy}>{sample ? 'Only sample balances change.' : wallet.native ? 'Slush opens the hosted web app. Connect your Testnet account, enter this quantity again, review, and approve there. This screen will not submit a transaction or treat opening the link as a success.' : 'Confirm in your wallet. Payment, delivery, proceeds and change settle in one transaction. Gas is paid in Testnet SUI.'}</Text><Button text={sample ? 'Run sample purchase' : wallet.native ? 'Continue in Slush ↗' : 'Confirm in wallet'} disabled={!!pending || !!issue} onPress={purchase}/><Button quiet text="Cancel" onPress={() => setReview(false)}/></View></View></Modal>
  </SafeAreaView>;
}

function message(e: unknown) { return e instanceof Error ? e.message : String(e); }
function Button({ text, onPress, disabled, quiet, secondary }: { text: string; onPress: () => void; disabled?: boolean; quiet?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, quiet ? s.quiet : secondary ? s.secondary : s.primary, disabled && s.disabled, pressed && !disabled && s.pressed]}><Text style={[s.buttonText, (quiet || secondary) && s.buttonDark]}>{text}</Text></Pressable>;
}
function Field({ label, value, onChange, address }: { label: string; value: string; onChange: (value: string) => void; address?: boolean }) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={v => onChange(address ? v.trim() : v)} keyboardType={address ? 'default' : 'decimal-pad'} autoCapitalize="none" autoCorrect={false} style={s.input}/></View>;
}
function Panel({ children, style }: PropsWithChildren<{ style?: object }>) { return <View style={[s.panel, style]}>{children}</View>; }
function Banner({ title, text }: { title: string; text: string }) { return <View style={s.banner}><Text style={s.bannerTitle}>{title}</Text><Text style={s.small}>{text}</Text></View>; }
function Stat({ label, value, detail }: { label: string; value: string; detail: string }) { return <View style={s.flex}><Text style={s.eyebrow}>{label}</Text><Text style={s.statValue}>{value}</Text><Text style={s.small}>{detail}</Text></View>; }
function Empty({ text }: { text: string }) { return <View style={s.empty}><Text style={s.small}>{text}</Text></View>; }

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8f8f3' }, network: { backgroundColor: '#183e32', paddingHorizontal: 22, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, networkText: { color: '#f0f3e8', fontSize: 11 }, networkSmall: { color: '#afc5a9', fontSize: 8, alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 19, borderBottomWidth: 1, borderColor: '#dfe4d7' }, logo: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 37, color: '#183e32', letterSpacing: -2 }, goldText: { color: '#ac9455' }, wallet: { maxWidth: '65%' }, tag: { fontSize: 9, color: '#708467', letterSpacing: 1.5 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#dfe4d7', backgroundColor: '#f8f8f3' }, tab: { flex: 1, alignItems: 'center', paddingVertical: 17, borderBottomWidth: 2, borderBottomColor: 'transparent' }, tabActive: { borderBottomColor: '#ac9455' }, tabText: { fontSize: 12, color: '#819077' }, tabTextActive: { color: '#183e32', fontWeight: '600' },
  scroll: { paddingHorizontal: 20, paddingBottom: 35 }, container: { width: '100%', maxWidth: 1140, alignSelf: 'center', gap: 20 }, modeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 13 }, eyebrow: { color: '#7a896e', fontSize: 9, fontWeight: '600', letterSpacing: 1.7 },
  hero: { gap: 24, paddingVertical: 20 }, row: { flexDirection: 'row', alignItems: 'flex-start' }, flex: { flex: 1, minWidth: 0, gap: 10 }, heroTitle: { fontSize: 52, lineHeight: 58, letterSpacing: -2.5, color: '#213b33', marginTop: 15 }, heroCopy: { fontSize: 15, lineHeight: 25, color: '#6a786f', maxWidth: 440, marginVertical: 12 }, heading: { fontSize: 32, lineHeight: 39, letterSpacing: -1, color: '#213b33', marginVertical: 12 },
  art: { backgroundColor: '#eceedf', borderRadius: 12, height: 270, width: '100%', maxWidth: 420, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', overflow: 'hidden' }, barBack: { position: 'absolute', width: 132, height: 181, backgroundColor: '#bc9e53', borderRadius: 9, transform: [{ rotate: '-25deg' }], left: '23%', top: 36 }, bar: { width: 137, height: 190, backgroundColor: '#dec580', borderWidth: 2, borderColor: '#ead69e', borderRadius: 10, alignItems: 'center', justifyContent: 'space-evenly', transform: [{ rotate: '-18deg' }], marginLeft: 85, marginTop: 18, borderBottomWidth: 10, borderBottomColor: '#ac8c40' }, au: { color: '#866a31', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 63 }, barLabel: { fontSize: 8, color: '#866a31', letterSpacing: 1.5 },
  columns: { gap: 22 }, stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 25, paddingVertical: 22, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#dfe4d7' }, statValue: { fontSize: 26, letterSpacing: -.7, color: '#213b33' }, panel: { backgroundColor: '#fffefa', borderWidth: 1, borderColor: '#dfe4d4', borderRadius: 12, padding: 24, gap: 14, width: '100%' }, sectionTitle: { color: '#213b33', fontSize: 19, fontWeight: '500', letterSpacing: -.4 }, body: { color: '#41573e', fontSize: 12, lineHeight: 20 }, copy: { color: '#71806a', fontSize: 13, lineHeight: 23 }, small: { color: '#829075', fontSize: 10, lineHeight: 18 },
  field: { gap: 8, marginTop: 5 }, label: { color: '#6b7d60', fontSize: 11 }, input: { borderWidth: 1, borderColor: '#dae2ce', borderRadius: 7, minHeight: 48, padding: 13, fontSize: 16, color: '#213b33', backgroundColor: '#f7f9f1' }, button: { minHeight: 46, borderRadius: 7, paddingVertical: 13, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' }, primary: { backgroundColor: '#254936' }, secondary: { borderWidth: 1, borderColor: '#d4dec8', backgroundColor: '#f3f6ec' }, quiet: { backgroundColor: 'transparent', paddingHorizontal: 5 }, buttonText: { color: '#f6f8ed', fontSize: 12, fontWeight: '600' }, buttonDark: { color: '#617e4f' }, disabled: { opacity: .4 }, pressed: { opacity: .7 }, presets: { flexDirection: 'row', justifyContent: 'space-between' }, summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 10 }, total: { color: '#213b33', fontSize: 22, letterSpacing: -.5 },
  banner: { backgroundColor: '#efefdf', borderWidth: 1, borderColor: '#dbd9b8', padding: 17, borderRadius: 8, gap: 6 }, bannerTitle: { color: '#7c713d', fontSize: 12, fontWeight: '600' }, fieldError: { color: '#a0523e', fontSize: 12, lineHeight: 21 }, feedback: { padding: 16, backgroundColor: '#edf3e3', borderRadius: 8, color: '#4f6c3b', fontSize: 12, lineHeight: 22 }, error: { padding: 16, backgroundColor: '#faeae3', borderRadius: 8, color: '#9b4b36', fontSize: 12, lineHeight: 22 }, code: { color: '#6f805f', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11, lineHeight: 19 }, value: { color: '#213b33', fontSize: 15 }, movement: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, borderBottomWidth: 1, borderColor: '#e1e6d7', paddingVertical: 12 }, activity: { paddingVertical: 17, borderBottomWidth: 1, borderColor: '#e1e6d7', color: '#617e4f', fontSize: 12 }, empty: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#d9e1cc', backgroundColor: '#f6f8ef', padding: 26, borderRadius: 8, alignItems: 'center' }, request: { borderBottomWidth: 1, borderColor: '#e1e6d7', paddingVertical: 15, gap: 9 }, footer: { paddingVertical: 25, borderTopWidth: 1, borderColor: '#dfe4d7', gap: 12 },
  overlay: { flex: 1, backgroundColor: '#102b24bd', padding: 24, justifyContent: 'center', alignItems: 'center' }, modal: { width: '100%', maxWidth: 470, padding: 28, backgroundColor: '#fffefa', borderRadius: 12, gap: 17 },
});
