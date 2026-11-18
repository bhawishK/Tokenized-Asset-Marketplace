import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { api, demoFaucetUrl } from './config';
import { useWallet } from './wallet';
import { fundingBlockReason } from './funding-state';

type Health = { network: string; packageId: string; marketplaceId: string; amount: string; maxClaims: number };
type Challenge = { nonce: string; message: string };
type Claim = { digest: string; network: string; amount: string; gasRequested: boolean };
type Props = { disabled: boolean; onBusy: (busy: boolean) => void; onFunded: (digest: string) => void };

async function request<T>(route: string, body?: object, timeout = 5000): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${demoFaucetUrl.replace(/\/$/, '')}${route}`, {
      method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout),
    });
  } catch {
    throw new Error(route === '/claim'
      ? 'Funding confirmation was not received. Refresh balances and check the local service before retrying; a submitted transaction may still have succeeded.'
      : 'Local demo funding is not reachable. Start npm run demo from the project root, then retry.');
  }
  const value = await response.json();
  if (!response.ok) throw new Error(typeof value.error === 'string' ? value.error : 'Demo funding is unavailable.');
  return value as T;
}

export function DemoFunding({ disabled, onBusy, onFunded }: Props) {
  const wallet = useWallet();
  const [health, setHealth] = useState<Health | null>(null);
  const [status, setStatus] = useState('Checking the local funding service…');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const currentAddress = useRef(wallet.address);
  currentAddress.current = wallet.address;
  const mounted = useRef(true);
  const checking = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function check() {
    if (checking.current) return;
    checking.current = true;
    setError('');
    if (!api.configured) {
      setStatus('Testnet deployment configuration is missing. Restart Expo after configuring the package and marketplace IDs.');
      checking.current = false;
      return;
    }
    try {
      const info = await request<Health>('/health');
      if (info.network !== 'testnet' || info.packageId !== api.PACKAGE || info.marketplaceId !== api.MARKET || info.amount !== '250000000') throw new Error('Funding service deployment does not match this app.');
      if (!mounted.current) return;
      setHealth(info); setStatus('Ready · 250 MockUSD once per buyer wallet.');
    } catch (e) { if (mounted.current) { setHealth(null); setStatus('Demo funding service is offline. Start the app with npm run demo from the project root.'); setError(message(e)); } }
    finally { checking.current = false; }
  }
  useEffect(() => { void check(); }, [wallet.address, wallet.wrongNetwork]);
  useEffect(() => {
    if (health || working || !api.configured) return;
    const timer = setInterval(() => void check(), 5000);
    return () => clearInterval(timer);
  }, [health, working]);
  useEffect(() => { setError(''); if (health) setStatus('Ready · 250 MockUSD once per buyer wallet.'); }, [wallet.address]);

  async function claim() {
    const address = wallet.address;
    if (!address || disabled || working || wallet.native || wallet.wrongNetwork || !health) return;
    setWorking(true); onBusy(true); setError('');
    try {
      setStatus('Preparing a request for the connected wallet…');
      const challenge = await request<Challenge>('/challenge', { address });
      if (currentAddress.current !== address || !mounted.current) throw new Error('Wallet changed. Request again with the intended buyer account.');
      setStatus('Approve the ownership message in Slush. This does not spend your assets.');
      const signature = await wallet.signFundingMessage(challenge.message);
      if (currentAddress.current !== address || !mounted.current) throw new Error('Wallet changed. No funding request was submitted.');
      setStatus('Issuer is funding your wallet and verifying the Testnet receipt…');
      const result = await request<Claim>('/claim', { address, nonce: challenge.nonce, signature }, 180_000);
      if (currentAddress.current !== address || !mounted.current) return;
      if (result.network !== 'testnet' || result.amount !== '250000000' || !/^[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(result.digest)) throw new Error('Unexpected funding receipt. Check Testnet before retrying.');
      setStatus(result.gasRequested ? '250 MockUSD confirmed. A Testnet SUI faucet request was also sent for gas.' : '250 MockUSD confirmed. The public SUI faucet did not accept a gas request; use the faucet link below if your wallet needs gas.');
      onFunded(result.digest);
    } catch (e) {
      if (mounted.current && currentAddress.current === address) setError(/reject|cancel|denied/i.test(message(e)) ? 'Wallet request rejected. No funding was requested.' : message(e));
    } finally { if (mounted.current) setWorking(false); onBusy(false); }
  }
  const blockedReason = fundingBlockReason({
    configured: api.configured, connected: !!wallet.address, wrongNetwork: wallet.wrongNetwork,
    serviceReady: !!health, working, otherActionPending: disabled,
  });
  return <View style={s.panel}>
    <Text style={s.eyebrow}>GET STARTED ON TESTNET</Text>
    <Text style={s.title}>Get demo assets in this wallet.</Text>
    <Text style={s.copy}>Connect Slush, then request 250 MockUSD. Your wallet address is filled automatically. Approve an ownership message; the local issuer pays for the funding transaction. No address needs to be pasted into chat or a terminal.</Text>
    <Text accessibilityLiveRegion="polite" style={s.status}>{status}</Text>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!blockedReason }} disabled={!!blockedReason} onPress={() => void claim()} style={[s.button, !!blockedReason && s.disabled]}>
      <Text style={s.buttonText}>{working ? 'Funding in progress…' : 'Get 250 demo MockUSD'}</Text>
    </Pressable>
    {blockedReason && <Text accessibilityLiveRegion="polite" style={s.status}>{blockedReason}</Text>}
    {!wallet.address && <Text style={s.copy}>First select Connect wallet at the top of this page and connect Slush. This button will use that wallet automatically.</Text>}
    <View style={s.links}>
      <Pressable accessibilityRole="button" onPress={() => void check()} disabled={working || disabled}><Text style={s.link}>Retry funding connection</Text></Pressable>
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://faucet.sui.io/').catch(() => setError('Could not open the public Sui faucet.'))}><Text style={s.link}>Testnet SUI faucet ↗</Text></Pressable>
    </View>
    <Text style={s.small}>One claim per buyer in the local service's persistent record, up to 100 total claims. MockUSD and SUI are separate Testnet assets. This funding receipt is not a purchase receipt.</Text>
  </View>;
}
function message(e: unknown) { return e instanceof Error ? e.message : String(e); }
const s = StyleSheet.create({
  panel: { borderWidth: 1, borderColor: '#d6dfc4', backgroundColor: '#f0f4e7', borderRadius: 12, padding: 23, gap: 12 },
  eyebrow: { fontSize: 9, letterSpacing: 1.7, fontWeight: '600', color: '#7a896e' }, title: { fontSize: 21, color: '#213b33', letterSpacing: -.4 },
  copy: { fontSize: 12, lineHeight: 22, color: '#64775b' }, status: { fontSize: 12, lineHeight: 21, color: '#4f6c3b' }, error: { fontSize: 12, lineHeight: 21, color: '#a0523e' },
  button: { minHeight: 46, backgroundColor: '#254936', borderRadius: 7, padding: 14, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: '#f6f8ed', fontSize: 12, fontWeight: '600' }, disabled: { opacity: .45 },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16 }, link: { color: '#617e4f', fontSize: 11, paddingVertical: 6 }, small: { fontSize: 10, lineHeight: 18, color: '#829075' },
});
