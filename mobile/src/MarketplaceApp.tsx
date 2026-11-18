import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, useColorScheme, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { ComponentRef, PropsWithChildren } from 'react';
import type { Activity, MarketState, Redemption } from '../../src/marketplace-api';
import { UNIT, DEMO_PRICE, costOf, explorer, formatUnits as fmt, parseUnits, purchaseIssue, short, validAddress, verifySettlement } from '../../src/domain';
import type { Movement } from '../../src/domain';
import { api, webAppUrl } from './config';
import { useWallet, WalletControl } from './wallet';
import { slushBrowserUrl } from './handoff';
import { DemoFunding } from './DemoFunding';
import { serializeForWallet } from './wallet-transaction';

type Tab = 'Buy Gold' | 'Portfolio' | 'Account';
type WalletData = Awaited<ReturnType<typeof api.readWallet>>;
type Receipt = { title: string; digest?: string; changes: Movement[]; sample?: boolean; matched?: boolean; note?: string };

export function MarketplaceApp() {
  const wallet = useWallet();
  const s = useStyles();
  const dark = useColorScheme() === 'dark';
  const [tab, setTab] = useState<Tab>('Buy Gold');
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
  const [goldAction, setGoldAction] = useState<'transfer' | 'redeem' | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const busy = useRef(false);
  const generation = useRef(0);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const address = wallet.address;

  const refresh = useCallback(async () => {
    if (sample || !api.configured) return;
    const id = ++generation.current;
    setLoading(true);
    try {
      const [m, b] = await Promise.all([api.readMarket(), address ? api.readWallet(address) : Promise.resolve(null)]);
      if (generation.current !== id) return;
      setMarket(m); setBalances(b);
      // Purchases need balances and inventory, not the optional event feed.
      setLoading(false);
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
  useEffect(() => { if (receipt || error || pending) scroll.current?.scrollTo({ y: 0, animated: false }); }, [receipt, error, pending]);

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
  const purchaseBlock = pending ? 'Finish or cancel the pending wallet action first.'
    : !sample && !api.configured ? 'Testnet deployment configuration is missing.'
    : !sample && !address ? 'Connect your Testnet wallet above.'
    : !sample && wallet.wrongNetwork ? 'Select Sui Testnet in Slush.'
    : !sample && loading ? 'Reading your balances and marketplace inventory…'
    : !sample && (!balances || !market) ? 'Network state is unavailable. Retry the network connection below.'
    : !sample && address === market?.proceeds ? 'Connect a separate buyer wallet. This account receives seller proceeds.'
    : !sample && balances?.sui === 0n ? 'This wallet has no Testnet SUI for gas. Get free Testnet SUI below, then refresh balances.'
    : issue || null;

  async function openWalletBrowser() {
    try {
      setError('');
      await Linking.openURL(slushBrowserUrl(webAppUrl));
      setNotice('Opened the wallet browser. Connect the intended Testnet account and review your action there. Opening a link does not submit a transaction. Return here and refresh to read updated balances.');
    } catch (e) { setError(message(e)); }
  }
  async function execute(build: () => Promise<string>, title: string, purchase?: { units: bigint; cost: bigint }) {
    if (!canSign || !address || busy.current) { setError(busy.current ? 'Another wallet action is pending. Finish or cancel it in Slush.' : 'Wallet connection changed. Reconnect to Sui Testnet and review the purchase again.'); return; }
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
      void execute(async () => serializeForWallet(api.purchaseTx(units, payment)), 'Atomic purchase confirmed', { units, cost });
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
      else void execute(async () => serializeForWallet(kind === 'transfer' ? api.transferTx(n, recipient) : api.redeemTx(n)), kind === 'transfer' ? 'DemoGold transferred' : 'DemoGold surrendered to escrow');
    } catch (e) { setError(message(e)); }
  }
  async function verifyDigest() {
    if (busy.current || sample) return;
    if (!/^[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(digestInput.trim())) { setError('Enter a valid Testnet transaction digest.'); return; }
    busy.current = true; setPending('Reading Testnet transaction…'); setError('');
    try {
      const result = await api.client.getTransaction({ digest: digestInput.trim(), include: { balanceChanges: true, effects: true } });
      const t = result.Transaction ?? result.FailedTransaction;
      setReceipt({ title: result.FailedTransaction ? 'Confirmed failed transaction' : 'Confirmed transaction effects', digest: t.digest, changes: t.balanceChanges, note: 'These are network effects. This lookup alone does not assert that the transaction is a marketplace purchase.' });
    } catch (e) { setError(message(e)); }
    finally { busy.current = false; setPending(''); }
  }
  const safe = (fn: () => void) => { setError(''); try { fn(); } catch (e) { setError(message(e)); } };
  const navigate = (next: Tab) => { setTab(next); setReview(false); scroll.current?.scrollTo({ y: 0, animated: false }); };
  const fundingBusyChanged = useCallback((value: boolean) => {
    busy.current = value;
    setPending(value ? 'Demo funding in progress…' : '');
  }, []);

  return <SafeAreaView style={s.safe} edges={['top', 'left', 'right', 'bottom']}>
    <StatusBar style={dark ? 'light' : 'dark'} />
    <View style={s.header}><View style={s.headerInner}><Text style={s.brand}>Gold</Text><Text style={s.network}>Sui Testnet</Text></View></View>
    <ScrollView ref={scroll} style={s.flex} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <View style={s.container}>
        <View><Text accessibilityRole="header" style={s.heading}>{tab}</Text><Text style={s.copy}>Sui Testnet · Simulated assets</Text></View>
        {sample && <Banner title="Sample mode" text="Practice only. No network assets or transactions." />}
        {!sample && !api.configured && <Banner title="Testnet setup needed" text="Set the package and marketplace IDs in mobile/.env.local, then restart Expo." />}
        {!sample && wallet.wrongNetwork && <Banner title="Switch to Sui Testnet" text="Select Testnet in Slush, then reconnect if needed." />}
        {!!pending && <Text accessibilityLiveRegion="polite" style={s.feedback}>{pending}</Text>}
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        {!!notice && <Text accessibilityLiveRegion="polite" style={s.feedback}>{notice}</Text>}
        {receipt && <Panel>
          <Text style={s.sectionTitle}>{receipt.title}</Text>
          {receipt.sample && <Text style={s.copy}>SAMPLE / NOT ON-CHAIN</Text>}
          {receipt.matched && <Banner title="Payment and gold verified" text="Both asset movements settled under the same transaction digest." />}
          {!!receipt.note && <Text style={s.copy}>{receipt.note}</Text>}
          {!!receipt.digest && <><Text selectable style={s.code}>{receipt.digest}</Text>
            {receipt.changes.filter(c => c.coinType === api.USD || c.coinType === api.GOLD).map((c, i) => <DataRow key={i} label={(c.coinType === api.USD ? 'MockUSD' : 'DemoGold') + ' / ' + short(c.address)} value={(BigInt(c.amount) > 0n ? '+' : '') + fmt(BigInt(c.amount))} />)}
            <Button text="View transaction on explorer" secondary onPress={() => void Linking.openURL(explorer(receipt.digest!)).catch(e => setError(message(e)))} />
          </>}
          <Button quiet text="Close receipt" onPress={() => setReceipt(null)} />
        </Panel>}
        {tab === 'Buy Gold' && <>
          <Panel><View style={s.assetHeader}><View accessibilityElementsHidden style={s.goldTile}><Text style={s.goldSymbol}>Au</Text></View><View style={s.flex}><Text style={s.sectionTitle}>DemoGold</Text><Text style={s.copy}>Simulated gold token</Text></View></View>
            <DataRow label="Price per 1 dGOLD" value="100 MockUSD" />
            <DataRow label="Available" value={m ? fmt(m.inventory) + ' dGOLD' : 'Not loaded'} />
          </Panel>
          <Panel><Field label="Gold to buy (dGOLD)" value={quantity} onChange={setQuantity} />
            <View style={s.presets}>{['0.5', '1', '2'].map(q => <View style={s.flex} key={q}><Button secondary text={q + ' dGOLD'} onPress={() => setQuantity(q)} /></View>)}</View>
            <DataRow label="Your MockUSD" value={usd === null ? 'Not loaded' : fmt(usd)} />
            <DataRow label="You pay" value={cost > 0n ? fmt(cost) + ' MockUSD' : '--'} prominent />
            {!!purchaseBlock && <Text accessibilityLiveRegion="polite" style={s.copy}>{purchaseBlock}</Text>}
            {!sample && !address ? <Button text="Connect wallet in Account" onPress={() => navigate('Account')} /> : <Button text={wallet.native && !sample ? 'Continue in Slush' : 'Review purchase'} disabled={!!purchaseBlock} onPress={() => setReview(true)} />}
            {!sample && (!!address && (balances?.sui === 0n || (usd !== null && usd < cost))) && <Button quiet text="Get demo funds in Account" onPress={() => navigate('Account')} />}
            <Text style={s.small}>Payment and gold settle together. Gas is paid separately in Testnet SUI.</Text>
          </Panel>
          <Text style={s.small}>DemoGold has no physical backing or monetary value.</Text>
        </>}
        {tab === 'Portfolio' && <>
          <Panel><Text style={s.copy}>Your DemoGold</Text><Text style={s.balance}>{gold === null ? '--' : fmt(gold)}<Text style={s.balanceUnit}> dGOLD</Text></Text><DataRow label="MockUSD" value={usd === null ? 'Not loaded' : fmt(usd) + ' mUSD'} />
            {!sample && !address ? <Button text="Connect wallet in Account" onPress={() => navigate('Account')} /> : <View style={s.presets}><View style={s.flex}><Button secondary text="Transfer" disabled={!!pending || (!sample && !liveReady)} onPress={() => setGoldAction(goldAction === 'transfer' ? null : 'transfer')} /></View><View style={s.flex}><Button secondary text="Redeem" disabled={!!pending || (!sample && !liveReady)} onPress={() => setGoldAction(goldAction === 'redeem' ? null : 'redeem')} /></View></View>}
          </Panel>
          {goldAction && <Panel><Text style={s.sectionTitle}>{goldAction === 'transfer' ? 'Transfer gold' : 'Simulated redemption'}</Text><Field label="Amount (dGOLD)" value={amount} onChange={setAmount} />
            {goldAction === 'transfer' ? <Field label="Recipient address" value={recipient} onChange={setRecipient} address /> : <Text style={s.copy}>Tokens are surrendered to escrow. The issuer later burns them to complete the request. No physical delivery occurs.</Text>}
            <Button text={wallet.native && !sample ? 'Continue in Slush' : goldAction === 'transfer' ? 'Transfer DemoGold' : 'Surrender to escrow'} disabled={!!pending || (!sample && !liveReady)} onPress={() => act(goldAction)} /><Button quiet text="Cancel" onPress={() => setGoldAction(null)} />
          </Panel>}
          <Panel><Text style={s.sectionTitle}>Recent activity</Text>
            {sample ? sampleHistory.length ? sampleHistory.map((h, i) => <Text style={s.activity} key={i}>{h} / SAMPLE</Text>) : <Empty text="No sample activity yet." /> : activity.length ? activity.map((a, i) => <Pressable accessibilityRole="link" key={a.digest + i} style={s.activity} onPress={() => void Linking.openURL(explorer(a.digest)).catch(e => setError(message(e)))}><Text style={s.body}>{a.kind}</Text><Text style={s.copy}>{fmt(a.quantity)} dGOLD / {short(a.digest)} / View transaction</Text></Pressable>) : <Empty text={!address ? 'Connect a wallet to see your activity.' : 'No recent activity found.'} />}
            <Text style={s.small}>{sample ? 'This sample session only.' : historyNote || 'Recent marketplace events only. External coin transfers may not appear.'}</Text>
          </Panel>
          <Disclosure title="Verify a transaction" open={verifyOpen} onPress={() => setVerifyOpen(v => !v)}>{<><Field label="Testnet transaction digest" value={digestInput} onChange={setDigestInput} address /><Button secondary text="Read confirmed effects" disabled={!!pending || sample} onPress={() => void verifyDigest()} /></>}</Disclosure>
        </>}
        {tab === 'Account' && <>
          <Panel><Text style={s.sectionTitle}>Wallet</Text><WalletControl />
            <Text selectable style={s.code}>{address ?? 'No wallet connected'}</Text>
            {wallet.native && <><Text style={s.copy}>Watch an address here. Approve transactions in the Slush web app.</Text><Field label="Public Sui address" value={watchInput} onChange={setWatchInput} address /><Button secondary text="Watch address" disabled={!!pending || !api.configured} onPress={() => safe(() => { if (!validAddress(watchInput)) throw new Error('Enter a full nonzero Sui address.'); wallet.setWatchAddress(watchInput.toLowerCase()); })} /><Button quiet text="Open in Slush" onPress={() => void openWalletBrowser()} /></>}
            <DataRow label="Network" value="Sui Testnet" /><DataRow label="SUI for gas" value={balances ? formatSui(balances.sui) + ' SUI' : 'Not loaded'} />
            <Button secondary text="Get free Testnet SUI" disabled={!!pending} onPress={() => void Linking.openURL('https://faucet.sui.io/?network=testnet').catch(e => setError(message(e)))} />
          </Panel>
          {!sample && !wallet.native && <DemoFunding disabled={!!pending} onBusy={fundingBusyChanged} onFunded={digest => { setReceipt({ title: '250 MockUSD received', digest, changes: [], note: 'Demo funding confirmed. You can now buy DemoGold; Testnet SUI is also needed for gas.' }); void refresh(); }} />}
          <Panel><Text style={s.sectionTitle}>About this demo</Text><Text style={s.copy}>100 MockUSD buys 1 DemoGold. Both use 6 decimal places. These are simulated assets with no real value or physical backing.</Text><Button secondary text={sample ? 'Return to Testnet' : 'Try sample mode'} disabled={!!pending} onPress={() => { setSample(v => !v); setReview(false); }} /></Panel>
          <Disclosure title="Issuer tools" open={toolsOpen} onPress={() => setToolsOpen(v => !v)}>
            <Text style={s.copy}>{sample ? 'Sample mode has no issuer authority.' : balances?.cap ? 'This account holds the issuer capability.' : 'Viewer access. An issuer capability is required for these actions.'}</Text>
            <DataRow label="Inventory" value={m ? fmt(m.inventory) + ' dGOLD' : 'Not loaded'} /><Text style={s.copy}>Proceeds recipient</Text><Text selectable style={s.code}>{m?.proceeds ?? 'Not loaded'}</Text>
            {wallet.native && <Button secondary text="Open issuer account in Slush" onPress={() => void openWalletBrowser()} />}
            {issuer && <><Field label="Inventory to mint (dGOLD)" value={mintAmount} onChange={setMintAmount} /><Button secondary text="Mint inventory" disabled={!!pending} onPress={() => safe(() => { const n = parseUnits(mintAmount); void execute(async () => serializeForWallet(api.mintTx(balances!.cap!, n)), 'Inventory minted'); })} /><Field label="Buyer address" value={fundAddress} onChange={setFundAddress} address /><Field label="MockUSD to mint" value={fundAmount} onChange={setFundAmount} /><Button secondary text="Fund buyer" disabled={!!pending} onPress={() => safe(() => { if (!validAddress(fundAddress)) throw new Error('Enter a valid buyer address.'); const n = parseUnits(fundAmount); void execute(async () => serializeForWallet(api.fundTx(balances!.cap!, n, fundAddress)), 'Buyer funded'); })} /></>}
            <Text style={s.sectionTitle}>Redemption requests</Text><Text style={s.small}>Recent event window. Status is read from each request object.</Text>
            {requests.length ? requests.map(r => <View key={r.id} style={s.activity}><Text style={s.body}>{fmt(r.quantity)} dGOLD / {r.status === 0 ? 'In escrow' : 'Burned'}</Text><Text style={s.small}>{short(r.holder)} / {short(r.id)}</Text>{issuer && r.status === 0 && <Button secondary text="Complete and burn" disabled={!!pending} onPress={() => void execute(async () => serializeForWallet(api.completeTx(balances!.cap!, r.id)), 'Redemption burned')} />}</View>) : <Empty text="No recent requests." />}
          </Disclosure>
        </>}
        <Button quiet text={loading ? 'Refreshing balances...' : 'Refresh balances'} disabled={sample || !api.configured || loading || !!pending} onPress={() => { setError(''); void refresh(); }} />
      </View>
    </ScrollView>
    <View style={s.tabShell}><View accessibilityRole="tablist" style={s.tabs}>{(['Buy Gold', 'Portfolio', 'Account'] as Tab[]).map(t => <Pressable key={t} accessibilityRole="tab" accessibilityLabel={t} accessibilityState={{ selected: tab === t }} onPress={() => navigate(t)} style={({ pressed }) => [s.tab, tab === t && s.tabActive, pressed && s.pressed]}><Text style={[s.tabText, tab === t && s.tabTextActive]}>{t}</Text></Pressable>)}</View></View>
    <Modal visible={review} transparent animationType="fade" onRequestClose={() => setReview(false)}><View style={s.overlay}><View accessibilityViewIsModal style={s.modal}><ScrollView contentContainerStyle={s.modalContent}><Text accessibilityRole="header" style={s.sectionTitle}>{sample ? 'Sample purchase' : 'Review purchase'}</Text><DataRow label="You receive" value={fmt(units) + ' dGOLD'} prominent /><DataRow label="You pay" value={fmt(cost) + ' MockUSD'} prominent /><Text style={s.copy}>{sample ? 'Only sample balances change.' : wallet.native ? 'Continue in Slush, connect your Testnet wallet and review this amount again.' : 'Payment and gold settle in one transaction. Approve in Slush; Testnet SUI pays the gas.'}</Text><Button text={sample ? 'Run sample purchase' : wallet.native ? 'Continue in Slush' : 'Confirm in wallet'} disabled={!!pending || !!purchaseBlock} onPress={purchase} /><Button quiet text="Cancel" onPress={() => setReview(false)} /></ScrollView></View></View></Modal>
  </SafeAreaView>;
}

function formatSui(value: bigint) { return (value / 1_000_000_000n).toString() + '.' + (value % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '').padEnd(1, '0'); }
function message(e: unknown) { return e instanceof Error ? e.message : String(e); }
function Button({ text, onPress, disabled, quiet, secondary }: { text: string; onPress: () => void; disabled?: boolean; quiet?: boolean; secondary?: boolean }) {
  const s = useStyles();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, quiet ? s.quiet : secondary ? s.secondary : s.primary, disabled && s.disabled, pressed && !disabled && s.pressed]}><Text style={[s.buttonText, (quiet || secondary) && s.buttonDark]}>{text}</Text></Pressable>;
}
function Field({ label, value, onChange, address }: { label: string; value: string; onChange: (value: string) => void; address?: boolean }) {
  const s = useStyles();
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={v => onChange(address ? v.trim() : v)} keyboardType={address ? 'default' : 'decimal-pad'} autoCapitalize="none" autoCorrect={false} style={s.input}/></View>;
}
function Panel({ children }: PropsWithChildren) { const s = useStyles(); return <View style={s.panel}>{children}</View>; }
function Banner({ title, text }: { title: string; text: string }) { const s = useStyles(); return <View style={s.banner}><Text style={s.sectionTitle}>{title}</Text><Text style={s.copy}>{text}</Text></View>; }
function Empty({ text }: { text: string }) { const s = useStyles(); return <Text style={s.copy}>{text}</Text>; }
function DataRow({ label, value, prominent }: { label: string; value: string; prominent?: boolean }) { const s = useStyles(); return <View style={s.dataRow}><Text style={s.copy}>{label}</Text><Text style={[s.dataValue, prominent && s.total]}>{value}</Text></View>; }
function Disclosure({ title, open, onPress, children }: PropsWithChildren<{ title: string; open: boolean; onPress: () => void }>) { const s = useStyles(); return <View style={s.panel}><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onPress} style={s.disclosure}><Text style={s.body}>{title}</Text><Text style={s.copy}>{open ? 'Hide' : 'Show'}</Text></Pressable>{open && children}</View>; }

function createStyles(dark: boolean) {
  const c = dark ? { background: '#121417', surface: '#1d2025', text: '#f2f3f5', muted: '#b0b6c0', accent: '#e4c479', line: '#41464f' } : { background: '#f4f5f7', surface: '#ffffff', text: '#1b1f26', muted: '#59616e', accent: '#765416', line: '#d9dde3' };
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background }, flex: { flex: 1, minWidth: 0 },
    header: { backgroundColor: c.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.line, paddingHorizontal: 20 }, headerInner: { width: '100%', maxWidth: 680, alignSelf: 'center', minHeight: 64, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, brand: { color: c.text, fontSize: 20, fontWeight: '700' }, network: { color: c.accent, fontSize: 13, fontWeight: '600' },
    scroll: { paddingHorizontal: 20, paddingVertical: 28 }, container: { width: '100%', maxWidth: 680, alignSelf: 'center', gap: 20 }, heading: { fontSize: 34, fontWeight: '700', color: c.text, letterSpacing: -0.8, marginBottom: 6 },
    panel: { backgroundColor: c.surface, borderRadius: 20, padding: 22, gap: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }, sectionTitle: { color: c.text, fontSize: 20, fontWeight: '600' }, body: { color: c.text, fontSize: 17, lineHeight: 25 }, copy: { color: c.muted, fontSize: 17, lineHeight: 26 }, small: { color: c.muted, fontSize: 13, lineHeight: 20 },
    assetHeader: { flexDirection: 'row', alignItems: 'center', gap: 16 }, goldTile: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent }, goldSymbol: { color: c.surface, fontSize: 26, fontWeight: '600' },
    dataRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }, dataValue: { color: c.text, fontSize: 17, fontWeight: '500', flexShrink: 1, fontVariant: ['tabular-nums'] }, total: { fontSize: 22, fontWeight: '600' }, balance: { fontSize: 40, color: c.text, fontWeight: '600', fontVariant: ['tabular-nums'] }, balanceUnit: { fontSize: 18, color: c.muted },
    field: { gap: 10 }, label: { color: c.text, fontSize: 15, fontWeight: '500' }, input: { backgroundColor: c.background, color: c.text, borderWidth: 1, borderColor: c.line, borderRadius: 12, minHeight: 56, padding: 15, fontSize: 20 },
    button: { minHeight: 50, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center' }, primary: { backgroundColor: c.accent }, secondary: { backgroundColor: c.background, borderWidth: 1, borderColor: c.line }, quiet: { backgroundColor: 'transparent' }, buttonText: { color: c.surface, fontSize: 16, fontWeight: '600', textAlign: 'center' }, buttonDark: { color: c.accent }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.7 }, presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    feedback: { color: c.text, backgroundColor: c.surface, padding: 18, borderRadius: 12, fontSize: 16, lineHeight: 24 }, error: { color: c.text, backgroundColor: c.surface, borderLeftWidth: 4, borderColor: c.accent, padding: 18, borderRadius: 12, fontSize: 16, lineHeight: 24 }, banner: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.accent, padding: 18, borderRadius: 16, gap: 8 }, code: { color: c.muted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, lineHeight: 21, flexShrink: 1 }, activity: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.line, paddingVertical: 16, gap: 8 }, disclosure: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    tabShell: { backgroundColor: c.surface, borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.line, paddingHorizontal: 12, paddingVertical: 10 }, tabs: { flexDirection: 'row', width: '100%', maxWidth: 680, alignSelf: 'center', gap: 4 }, tab: { flex: 1, minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', padding: 10 }, tabActive: { backgroundColor: c.background }, tabText: { color: c.muted, fontSize: 14, fontWeight: '500', textAlign: 'center' }, tabTextActive: { color: c.accent, fontWeight: '700' },
    overlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', alignItems: 'center', padding: 20 }, modal: { width: '100%', maxWidth: 460, maxHeight: '90%', backgroundColor: c.surface, borderRadius: 24 }, modalContent: { padding: 24, gap: 24 },
  });
}
const lightStyles = createStyles(false);
const darkStyles = createStyles(true);
function useStyles() { return useColorScheme() === 'dark' ? darkStyles : lightStyles; }
