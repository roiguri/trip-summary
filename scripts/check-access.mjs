// Sign-in and access, end to end against the running app on the emulators (docs/ARCHITECTURE.md,
// "Sign-in and access"). Needs the sample and the test trip seeded. Exits 1 on a failure.
//   BASE_URL=http://localhost:3100 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run check:access
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const SAMPLE = '/trips/sample-coast';
const OTHER = '/trips/test-kansai';
const R = [];
const ok = (name, cond, extra = '') =>
  R.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` (${extra})` : ''}`);
const get = (path, init = {}) => fetch(BASE + path, { redirect: 'manual', ...init });

// Signed out.
let r = await get(SAMPLE);
ok(
  'signed out, a trip sends you to sign in',
  r.status === 307 &&
    r.headers.get('location')?.includes(`/sign-in?next=${encodeURIComponent(SAMPLE)}`),
  r.status,
);
r = await get('/');
ok('signed out, home sends you to sign in', r.headers.get('location')?.startsWith('/sign-in'));
r = await get('/api/auth/session', {
  method: 'POST',
  headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
  body: '{"idToken":"x"}',
});
ok('another site cannot post a sign-in', r.status === 403, r.status);
r = await get('/api/auth/session', {
  method: 'POST',
  headers: { Origin: BASE, 'Content-Type': 'application/json' },
  body: '{"idToken":"forged"}',
});
ok('a forged sign-in is refused', r.status === 401, r.status);
r = await get('/api/auth/sign-out', {
  method: 'POST',
  headers: { Origin: 'https://evil.example' },
});
ok('another site cannot sign you out', r.status === 403, r.status);

const browser = await chromium.launch();
const ctx = () => browser.newContext();

// The editor (the owner).
const editor = await ctx();
const ep = await editor.newPage();
await ep.goto(`${BASE}/api/auth/dev?as=editor&next=${SAMPLE}`);
ok(
  'the owner opens the sample',
  ep.url().endsWith(SAMPLE) && (await ep.locator('.day-section').count()) > 0,
);
await ep.goto(BASE + '/');
ok(
  'the owner’s home lists every trip and offers a new one',
  // the sample, the test trip and the mock trip (seeded for edit mode)
  (await ep.locator('.trip-card').count()) === 3 &&
    (await ep.locator('text=+ New trip').count()) === 1,
);
const res = await ep.goto(BASE + '/trips/no-such-trip');
ok('a trip that does not exist is not found', res?.status() === 404, res?.status());
const [sess] = (await editor.cookies()).filter((c) => c.name === '__session');
ok(
  'the session cookie is HTTP-only, Secure and SameSite=Lax',
  sess?.httpOnly && sess.secure && sess.sameSite === 'Lax',
);

// A viewer with an invite link.
const viewer = await ctx();
const vp = await viewer.newPage();
const landed = await vp.goto(`${BASE}/api/auth/dev?as=invite&trip=sample-coast`);
let hop = landed?.request();
let invite;
while (hop) {
  if (new URL(hop.url()).pathname.startsWith('/invite/')) invite = hop.url();
  hop = hop.redirectedFrom();
}
ok(
  'an invite link opens the shared trip',
  vp.url().endsWith(SAMPLE) && (await vp.locator('.day-section').count()) > 0,
);
const other = await vp.goto(BASE + OTHER);
ok("a viewer cannot open a trip they weren't invited to", other?.status() === 404, other?.status());
await vp.goto(BASE + '/');
ok(
  'a viewer’s home lists only their trip, without editors’ details',
  (await vp.locator('.trip-card').count()) === 1 &&
    (await vp.locator('.trip-status').count()) === 0 &&
    (await vp.locator('text=+ New trip').count()) === 0,
);

// The same link in another browser.
const second = await ctx();
const sp = await second.newPage();
await sp.goto(invite);
ok(
  'the link is refused in a second browser',
  sp.url().includes('/invite/problem?reason=other-device'),
);
r = await sp.goto(BASE + SAMPLE);
ok('and that browser is not signed in', sp.url().includes('/sign-in'));
await sp.goto(BASE + '/invite/not-a-real-link');
ok(
  'a made-up link explains itself',
  sp.url().includes('/invite/problem') &&
    (await sp.locator('h1').textContent())?.includes('doesn’t work'),
);

// The first browser can open its link again.
await vp.goto(invite);
ok('the same browser can reopen its link', vp.url().endsWith(SAMPLE));

// Signing out.
await vp.evaluate(() => fetch('/api/auth/sign-out', { method: 'POST' }));
await vp.goto(BASE + SAMPLE);
ok('after signing out, the trip asks for sign-in again', vp.url().includes('/sign-in'));

// A Google account that is neither the owner nor on any trip (a fresh emulator sign-in).
const signUp = await fetch(
  `http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `stranger-${Date.now()}@example.com`,
      password: 'not-a-real-password',
      returnSecureToken: true,
    }),
  },
);
const { idToken } = await signUp.json();
const stranger = await ctx();
const tp = await stranger.newPage();
await tp.goto(BASE + '/sign-in');
const status = await tp.evaluate(
  async (t) =>
    (
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: t }),
      })
    ).status,
  idToken,
);
ok('a fresh sign-in becomes a session', status === 204, status);
await tp.goto(BASE + '/');
ok(
  'a stranger sees no trips',
  (await tp.locator('h1').textContent())?.includes('No trips to show yet'),
);
const strangerTrip = await tp.goto(BASE + SAMPLE);
ok('and cannot open one', strangerTrip?.status() === 404, strangerTrip?.status());

// The editors' bar, sharing and publishing.
const owner = await ctx();
const op = await owner.newPage();
await op.goto(`${BASE}/api/auth/dev?as=editor&next=${SAMPLE}`);
ok('the owner sees the editors’ bar', (await op.locator('.editor-bar').count()) === 1);
ok(
  'the header names the account, with sign-out',
  (await op.locator('.header .status').textContent()).includes('Sign out'),
);
await op.goto(`${BASE}${SAMPLE}?view=viewer`);
ok(
  'previewing as a viewer hides the bar, with a way back',
  (await op.locator('.editor-bar').count()) === 0 &&
    (await op.locator('.preview-exit').count()) === 1,
);
const mock = await ctx();
const mp = await mock.newPage();
await mp.goto(`${BASE}/api/auth/dev?as=viewer&trip=sample-coast&next=${SAMPLE}`);
ok(
  'a viewer sees no editors’ bar',
  (await mp.locator('.day-section').count()) > 0 && (await mp.locator('.editor-bar').count()) === 0,
);

await op.goto(BASE + SAMPLE);
await op.click('.editor-bar [aria-controls="share"]');
await op.fill('#new-person', 'Grandma');
await op.getByRole('button', { name: 'Create link' }).click();
await op.waitForSelector('#fresh-link');
const link = await op.inputValue('#fresh-link');
ok('sharing makes a personal link, shown once', /\/invite\/[A-Za-z0-9_-]{43}$/.test(link));
const grandma = await ctx();
const gp = await grandma.newPage();
await gp.goto(link);
ok('the link opens the trip', gp.url().endsWith(SAMPLE));
await op.reload();
await op.click('.editor-bar [aria-controls="share"]');
ok(
  'the share list shows them as having opened it',
  (await op.locator('.person', { hasText: 'Grandma' }).textContent()).includes('Opened'),
);
await op.locator('.person', { hasText: 'Grandma' }).getByRole('button', { name: 'Revoke' }).click();
await op.waitForFunction(
  () => ![...document.querySelectorAll('.person')].some((e) => e.textContent.includes('Grandma')),
);
await new Promise((r) => setTimeout(r, 1100)); // revocation is recorded to the second
await gp.goto(BASE + SAMPLE);
ok('revoking ends their session at once', gp.url().includes('/sign-in'));

const kansai = '/trips/test-kansai';
await op.goto(BASE + kansai);
await op.getByRole('button', { name: /Make it a draft/ }).click();
await op.waitForSelector('.editor-bar >> text=Publish');
const kv = await ctx();
const kp = await kv.newPage();
const draftRes = await kp.goto(`${BASE}/api/auth/dev?as=viewer&trip=test-kansai&next=${kansai}`);
ok('a draft is hidden from its viewers', draftRes?.status() === 404, draftRes?.status());
await op.getByRole('button', { name: 'Publish' }).click();
await op.waitForSelector('.editor-bar >> text=Make it a draft', { state: 'attached' });
await kp.goto(BASE + kansai);
ok('publishing shows it to them', (await kp.locator('.day-section').count()) > 0);

await browser.close();
console.log(R.join('\n'));
process.exit(R.some((l) => l.startsWith('FAIL')) ? 1 : 0);
