export function slushBrowserUrl(webAppUrl: string): string {
  let url: URL;
  try { url = new URL(webAppUrl); } catch { throw new Error('Configure EXPO_PUBLIC_WEB_APP_URL with the hosted Expo web app URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) {
    throw new Error('Wallet handoff requires a public HTTPS app URL without credentials, query or fragment.');
  }
  // Official Slush browse/:url format. Review and sign in the wallet browser.
  // No transaction intent or untrusted success callback is put in this URL.
  return `https://my.slush.app/browse/${url.href}`;
}
