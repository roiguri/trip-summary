// State-changing requests must come from this site's own pages (a cross-site form or script can't
// post a session in or out, or change a trip). The browser's Origin is compared with the address the
// request arrived at: its Host, or the host a proxy (Netlify) forwarded. The server's own idea of its
// URL can differ behind a proxy, so it's only one of the accepted hosts. HTTPS is required, except on
// a local machine.
const LOCAL = new Set(['localhost', '127.0.0.1']);

export function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  let from: URL;
  try {
    from = new URL(origin);
  } catch {
    return false;
  }
  if (from.protocol !== 'https:' && !LOCAL.has(from.hostname)) return false;
  const hosts = [
    req.headers.get('x-forwarded-host')?.split(',')[0]?.trim(),
    req.headers.get('host'),
    new URL(req.url).host,
  ];
  return hosts.some((h) => h && h === from.host);
}
