// Blocks, end to end on the seeded mock trip (DESIGN.md, "Blocks"): start a block from an entry,
// attach another (everything between joins), the ticket and its album, rename, and ungroup.
//   BASE_URL=http://localhost:3100 npm run check:blocks   (after `npm run seed -- --mocks`)
//   SHOTS=<dir> also saves screenshots of the block on a desktop and a phone.
import { chromium } from 'playwright';
import { signIn } from './signed-in.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const SHOTS = process.env.SHOTS;
const TRIP = `${BASE}/trips/sample-coast-merged`;
const R = [];
const ok = (name, cond, extra = '') =>
  R.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` (${extra})` : ''}`);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await signIn(ctx, BASE);
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));

// Day 2: the drive (i6), a viewpoint (i7) and a walk (i8).
const pencil = (id) => p.locator(`.left [data-entry-id="${id}"] .pencil:visible`).first();
const inSheet = (id) => p.locator(`.left .block-sheet [data-entry-id="${id}"]`).count();
await p.goto(`${TRIP}?edit=1`, { waitUntil: 'networkidle' });
ok('no blocks to begin with', (await p.locator('.block-sheet').count()) === 0);

// Start a block from the drive.
await pencil('i6').click();
await p.getByRole('button', { name: 'Start a block here' }).click();
await p.locator('#bk-title').fill('Coast drive');
await p.getByRole('radio', { name: '🚗' }).click();
await p.getByRole('radio', { name: 'olive' }).click();
await p.getByRole('button', { name: 'Start the block' }).click();
await p.waitForSelector('.left .block-sheet', { timeout: 15_000 });
ok('starting a block draws its sheet around the entry', (await inSheet('i6')) === 1);
ok(
  'the entry’s editor says which block it is in',
  (await p.locator('.ed-block').textContent()).includes('Coast drive'),
);

// Attach the walk: the viewpoint between them joins too.
await pencil('i8').click();
await p.getByRole('button', { name: 'Add to block ▾' }).click();
await p.getByRole('menuitem', { name: /Coast drive/ }).click();
await p.waitForFunction(
  () => document.querySelector('.left .block-sheet [data-entry-id="i8"]'),
  null,
  { timeout: 15_000 },
);
ok('attaching an entry takes in everything between', (await inSheet('i7')) === 1);
const ticket = p.locator('.left .block-ticket').first();
const ticketText = await ticket.textContent();
ok(
  'the ticket shows the emoji, title and span',
  /🚗.*Coast drive.*09:00/.test(ticketText),
  ticketText,
);
const tb = await ticket.boundingBox();
const sb = await p.locator('.left .block-sheet').first().boundingBox();
ok(
  'the ticket sits at the sheet’s top right',
  tb && sb && tb.x + tb.width > sb.x + sb.width / 2 && tb.y - sb.y < 30,
);
if (SHOTS)
  await p
    .locator('.left .block-sheet')
    .first()
    .screenshot({ path: `${SHOTS}/desk-edit.png` });

// The middle entry can't be taken out on its own; the ends can.
await pencil('i7').click();
ok(
  'a middle entry is inside, with no Remove',
  (await p.getByRole('button', { name: 'Remove from the block' }).count()) === 0,
);

// From the ticket in edit mode: the block's editor. Rename it.
await ticket.click();
await p.waitForSelector('.editor[aria-label^="Edit block"]');
await p.locator('#bk-title').fill('Coast road');
await p.getByRole('button', { name: 'Save', exact: true }).click();
await p.waitForFunction(
  () => document.querySelector('.left .block-ticket')?.textContent.includes('Coast road'),
  null,
  { timeout: 15_000 },
);
ok('renaming shows on the ticket', true);

// For a viewer, the ticket opens the block's album.
await p.goto(TRIP, { waitUntil: 'networkidle' });
await p.locator('.left .block-ticket').first().click();
await p.waitForTimeout(400);
ok(
  'the ticket opens the block in the detail card',
  (await p.locator('body').textContent()).includes('THE BLOCK'),
);
if (SHOTS) {
  await p.locator('.left .block-sheet').first().scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${SHOTS}/desk-view.png` });
}

// On a phone: the sheet spans the column, the ticket at its right.
const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
await signIn(phone, BASE);
const q = await phone.newPage();
q.on('pageerror', (e) => errors.push(String(e)));
await q.goto(TRIP, { waitUntil: 'networkidle' });
const qs = await q.locator('.left .block-sheet').first().boundingBox();
const qt = await q.locator('.left .block-ticket').first().boundingBox();
ok(
  'on a phone the ticket stays on screen',
  qs && qt && qt.x >= 0 && qt.x + qt.width <= 390,
  JSON.stringify(qt),
);
if (SHOTS)
  await q
    .locator('.left .block-sheet')
    .first()
    .screenshot({ path: `${SHOTS}/phone.png` });

// Ungroup: the block goes, its entries stay.
await p.goto(`${TRIP}?edit=1`, { waitUntil: 'networkidle' });
await p.locator('.left .block-ticket').first().click();
await p.getByRole('button', { name: 'Ungroup the block' }).click();
await p.getByRole('button', { name: 'Ungroup', exact: true }).click();
await p.waitForFunction(() => !document.querySelector('.block-sheet'), null, { timeout: 15_000 });
ok(
  'ungrouping removes the block and keeps its entries',
  (await p.locator('.left [data-entry-id="i7"]').count()) === 1,
);

ok('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(R.join('\n'));
const failed = R.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${R.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
