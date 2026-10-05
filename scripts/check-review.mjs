// Photo review in edit mode, end to end on the seeded mock trip (DESIGN.md, "Photo review"): full
// screen from an entry, staged decisions (highlight, hide, move) in one view and the grid, the
// summary, Save all as one save, and the guard against leaving with unsaved changes.
//   BASE_URL=http://localhost:3100 npm run check:review   (after `npm run seed -- --mocks`)
import { chromium } from 'playwright';
import { signIn } from './signed-in.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const R = [];
const ok = (name, cond, extra = '') =>
  R.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` (${extra})` : ''}`);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await signIn(ctx, BASE);
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
const saves = [];
p.on('request', (r) => r.url().includes('/edits') && r.method() === 'POST' && saves.push(r.url()));

await p.goto(`${BASE}/trips/sample-coast-merged?edit=1`, { waitUntil: 'networkidle' });
const entry = (title) => p.locator('.left .entry', { hasText: title }).first();
await entry('Carmel Beach').locator('.pencil:visible').click();
await p.getByRole('button', { name: 'Full screen' }).click();
await p.waitForSelector('.photo-review');
ok('an entry’s photos open full screen', (await p.locator('.rv-one img').count()) === 1);

// One photo at a time: S highlights, H hides (staged, not saved).
await p.keyboard.press('s');
await p.keyboard.press('ArrowRight');
await p.keyboard.press('h');
ok(
  'decisions are marked on the photos, not saved',
  saves.length === 0 && (await p.locator('.rv-commit').textContent()).includes('2 changes'),
  await p.locator('.rv-commit').textContent(),
);

// The grid: select a range, move them.
await p.getByRole('button', { name: 'Grid', exact: true }).click();
const tiles = p.locator('.rv-tile');
await tiles.nth(3).click();
await tiles.nth(5).click({ modifiers: ['Shift'] });
ok('shift-click selects a range', (await p.locator('.rv-tile.on').count()) === 3);
await p.getByRole('button', { name: /Move to/ }).click();
await p.locator('.rv-moveto button', { hasText: 'Point Lobos' }).click();
const summary = await p.locator('.rv-commit').textContent();
ok(
  'the summary counts each kind of change',
  /5 changes/.test(summary) &&
    /1 hidden/.test(summary) &&
    /1 highlighted/.test(summary) &&
    /3 moved/.test(summary),
  summary,
);

// Leaving asks first.
await p.locator('.rv-close').click();
ok('closing with unsaved changes asks first', (await p.locator('.rv-leave').count()) === 1);
await p.locator('.rv-leave').getByRole('button', { name: 'Stay' }).click();

// Save all: one save, and the journey shows it.
const before = Number((await p.locator('.ed-photos-head b').textContent()).match(/\d+/)?.[0] ?? 0);
await p.getByRole('button', { name: 'Save all' }).click();
await p.waitForFunction(
  () => !document.querySelector('.rv-commit')?.textContent.includes('changes'),
  null,
  {
    timeout: 15_000,
  },
);
ok('Save all is one save', saves.length === 1, saves.length);
await p.locator('.rv-close').click();
ok('with nothing pending, it closes at once', (await p.locator('.photo-review').count()) === 0);
const after = Number((await p.locator('.ed-photos-head b').textContent()).match(/\d+/)?.[0] ?? 0);
ok('moved and hidden photos left the entry', after === before - 4, `${before} → ${after}`);
ok(
  'the highlight shows on the journey',
  (await entry('Carmel Beach').locator('.photo-star').count()) === 1,
);

// Discard leaves everything as it was.
await p.getByRole('button', { name: 'Full screen' }).click();
await p.keyboard.press('s');
await p.locator('.rv-close').click();
await p.locator('.rv-leave').getByRole('button', { name: 'Discard and close' }).click();
ok(
  'Discard and close saves nothing',
  saves.length === 1 && (await p.locator('.photo-review').count()) === 0,
);
// On a phone: swipe between photos, and select a range without a Shift key.
const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
await signIn(phone, BASE);
const q = await phone.newPage();
q.on('pageerror', (e) => errors.push(String(e)));
await q.goto(`${BASE}/trips/sample-coast-merged?edit=1`, { waitUntil: 'networkidle' });
await q
  .locator('.left .entry', { hasText: 'Point Lobos' })
  .first()
  .locator('.pencil:visible')
  .click();
await q.getByRole('button', { name: 'Full screen' }).click();
await q.waitForSelector('.photo-review');
const box = await q.locator('.photo-review').boundingBox();
ok(
  'on a phone the viewer covers the whole screen',
  box.y === 0 && box.height === 844,
  JSON.stringify(box),
);
const caption = () => q.locator('.rv-one figcaption').textContent();
const first = await caption();
await q.locator('.rv-one').dispatchEvent('pointerdown', { clientX: 300, clientY: 400 });
await q.locator('.rv-one').dispatchEvent('pointerup', { clientX: 120, clientY: 410 });
ok(
  'a swipe moves to the next photo',
  (await caption()) !== first && (await caption()).includes('2 of'),
);
await q.getByRole('button', { name: 'Grid', exact: true }).click();
await q.locator('.rv-tile').nth(0).tap();
await q.getByRole('button', { name: 'Select range' }).tap();
await q.locator('.rv-tile').nth(3).tap();
ok('Select range then a tap selects the range', (await q.locator('.rv-tile.on').count()) === 4);

ok('no page errors', errors.length === 0, errors.join('; '));

await browser.close();
console.log(R.join('\n'));
process.exit(R.some((l) => l.startsWith('FAIL')) ? 1 : 0);
