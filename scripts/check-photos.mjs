// Photos, end to end in a browser against the running app on the emulators: a new trip from the mock
// Jarvis database, the mock pick copied in the background (across pages and a reload), the review,
// Apply, and the photos served through
// /media only to people who may see the trip. Exits 1 on a failure.
//   BASE_URL=http://localhost:3100 npm run check:photos
import { chromium } from 'playwright';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { signIn } from './signed-in.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const TRIP = `photos-check-${Date.now()}`;
const R = [];
const ok = (name, cond, extra = '') =>
  R.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` (${extra})` : ''}`);

const sample = JSON.parse(readFileSync('data/mock/expected.json', 'utf8')).trip;
const jarvis = path.join(mkdtempSync(path.join(tmpdir(), 'check-photos-')), 'travel.sqlite');
const db = new DatabaseSync(jarvis);
db.exec(readFileSync('data/mock/jarvis.sql', 'utf8').replaceAll(`'${sample}'`, `'${TRIP}'`));
db.close();

const browser = await chromium.launch();
const owner = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await signIn(owner, BASE);
const p = await owner.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));

await p.goto(`${BASE}/trips/new`);
await p.setInputFiles('#jarvis-file', jarvis);
await p.waitForSelector('.pick-trip');
await p.check(`input[value="${TRIP}"]`);
await p.getByRole('button', { name: 'Create the draft' }).click();
await p.waitForURL(new RegExp(`/trips/${TRIP}/sources$`));
ok(
  'without a Google connection, the row offers to connect',
  (await p.locator('text=Connect Google Photos').count()) === 1,
);

await p.getByRole('button', { name: 'Use the mock photos' }).click();
await p.waitForSelector('.copy-panel');
ok(
  'copying shows its progress in a panel',
  /Copying photos for/.test(await p.locator('.copy-panel').textContent()),
);
// It carries on while browsing elsewhere in the app, and across a page load.
await p.goto(`${BASE}/`);
await p.waitForSelector('.copy-panel');
ok('the panel follows you to other pages', (await p.locator('.copy-panel').count()) === 1);
await p.waitForFunction(
  () => /: \d+ of \d+/.test(document.querySelector('.copy-panel')?.textContent ?? ''),
  null,
  { timeout: 60_000 },
);
// A copy this browser stopped driving (an error, another browser): the sources page carries it on.
await p.evaluate(() => {
  localStorage.removeItem('ts_copy_job');
  localStorage.removeItem('ts_copy_lease');
});
await p.goto(`${BASE}/trips/${TRIP}/sources`);
const cont = p.getByRole('button', { name: 'Continue copying' });
ok('an unfinished copy offers to continue', (await cont.count()) === 1);
await cont.click();
await p.waitForSelector('.copy-panel');
await p.reload();
await p.waitForSelector('.copy-panel >> text=are in the trip', { timeout: 180_000 });
ok('it finishes after a page load, and says so', true);
// No review step (decided Oct 4): the copied photos are in the trip, marked new in edit mode.
await p.locator('.copy-panel').getByRole('link', { name: 'See them in edit mode' }).click();
await p.waitForURL(new RegExp(`/trips/${TRIP}\\?edit=1`));
await p.waitForSelector('.left .fnd.new-photos');
const chips = await p.locator('.left .fnd.new-photos').allTextContents();
const total = chips.reduce((n, t) => n + Number(t.match(/(\d+) new/)?.[1] ?? 0), 0);
ok('edit mode marks every copied photo as new', total === 79, `${total} in ${chips.length} chips`);
const firstNew = p.locator('.left .fnd.new-photos').first();
const label = await firstNew.locator('b').textContent();
await firstNew.getByRole('button', { name: 'Keep' }).click();
ok(
  'Keep stops marking them, and says so',
  await p
    .waitForFunction(
      (l) =>
        [...document.querySelectorAll('.left .fnd.done')].some((e) =>
          e.textContent.includes(`Kept ${l}`),
        ),
      label,
      { timeout: 15_000 },
    )
    .then(
      () => true,
      () => false,
    ),
  label,
);
await p.goto(`${BASE}/trips/${TRIP}/sources`);
ok(
  'the sources page counts them, with no review to do',
  (await p.locator('.src-row').nth(2).textContent()).includes('79 photos and videos') &&
    (await p.locator('.review').count()) === 0,
);
await p.goto(`${BASE}/trips/${TRIP}`);
await p.waitForLoadState('networkidle');
// Photos load as they come near the screen (lazily): scroll through the journey first.
await p.evaluate(async () => {
  const root = document.querySelector('.left');
  for (let y = 0; y < root.scrollHeight; y += 500) {
    root.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 120));
  }
});
await p.waitForLoadState('networkidle');
const imgs = await p
  .locator('.left img')
  .evaluateAll((els) =>
    els.map((e) => ({ src: e.getAttribute('src'), ok: e.complete && e.naturalWidth > 0 })),
  );
ok(
  'the journey shows the copied photos, as thumbnails from /media',
  imgs.length > 0 &&
    imgs.every(
      (i) =>
        i.src.startsWith(`/media/trips/${TRIP}/media/`) && i.src.endsWith('/thumb.jpg') && i.ok,
    ),
  `${imgs.filter((i) => !i.ok).length} broken of ${imgs.length}`,
);
const thumb = imgs[0].src;

// The files themselves.
const media = await owner.request.get(BASE + thumb);
ok(
  'the owner gets the file, privately cached',
  media.status() === 200 &&
    media.headers()['content-type'] === 'image/jpeg' &&
    media.headers()['cache-control'].startsWith('private'),
);
const videoPath = `/media/trips/${TRIP}/media/mock-media-video-1/video.mp4`;
const part = await owner.request.get(BASE + videoPath, { headers: { Range: 'bytes=0-3' } });
ok(
  'a video can be read in parts (seeking)',
  part.status() === 206 && part.headers()['content-range']?.startsWith('bytes 0-3/'),
  part.status(),
);
const guest = await browser.newContext();
await signIn(guest, BASE, 'guest');
const denied = await guest.request.get(BASE + thumb);
ok('someone without access gets nothing', denied.status() === 404, denied.status());
const anon = await fetch(BASE + thumb);
ok('and nor does anyone signed out', anon.status === 404, anon.status);
const traversal = await owner.request.get(
  `${BASE}/media/trips/${TRIP}/media/x/..%2F..%2F..%2Fsecret`,
);
ok('a path outside the media is refused', traversal.status() === 404, traversal.status());
ok('no page errors', errors.length === 0, errors.join('; '));

await browser.close();
console.log(R.join('\n'));
process.exit(R.some((l) => l.startsWith('FAIL')) ? 1 : 0);
