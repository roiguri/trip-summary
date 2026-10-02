// Adding a trip and importing, end to end in a browser against the running app on the emulators: a
// new trip from the mock Jarvis database, its Timeline through the file picker, the review, a
// suggestion, Apply and Discard. Exits 1 on a failure.
//   BASE_URL=http://localhost:3100 npm run check:import
import { chromium } from 'playwright';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { signIn } from './signed-in.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const TRIP = `import-check-${Date.now()}`;
const R = [];
const ok = (name, cond, extra = '') =>
  R.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` (${extra})` : ''}`);

// The mock Jarvis database as a file, with its trip renamed so the check never touches the sample.
const sample = JSON.parse(readFileSync('data/mock/expected.json', 'utf8')).trip;
const dir = mkdtempSync(path.join(tmpdir(), 'check-import-'));
const jarvis = path.join(dir, 'travel.sqlite');
const db = new DatabaseSync(jarvis);
db.exec(readFileSync('data/mock/jarvis.sql', 'utf8').replaceAll(`'${sample}'`, `'${TRIP}'`));
db.close();

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await signIn(context, BASE);
const p = await context.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));

await p.goto(`${BASE}/`);
await p.click('text=+ New trip');
await p.waitForURL(/\/trips\/new$/);
await p.setInputFiles('#jarvis-file', jarvis);
await p.waitForSelector('.pick-trip');
ok('the file’s trips are listed', (await p.locator('.pick-trip label').count()) === 2);
await p.check(`input[value="${TRIP}"]`);
await p.getByRole('button', { name: 'Create the draft' }).click();
await p.waitForURL(new RegExp(`/trips/${TRIP}/sources$`));
ok('the draft opens on its sources', (await p.locator('.trip-status.draft').count()) === 1);
ok(
  'the plan is in, the Timeline is not',
  (await p.locator('.src-row').nth(0).textContent()).includes('entries') &&
    (await p.locator('.src-row.todo').count()) === 2,
);

await p.setInputFiles('#timeline-file', 'data/mock/Timeline.json');
await p.waitForSelector('.src-slice');
ok(
  'the Timeline is sliced on this computer before uploading',
  /will be uploaded: \d+ visits and journeys/.test(await p.locator('.src-slice').textContent()),
);
await p.getByRole('button', { name: 'Upload the trip’s days' }).click();
await p.waitForSelector('.review');
const review = await p.locator('.review').textContent();
ok('the review shows the actual times', review.includes('09:28 – 10:53'));
ok('the review lists a stop that wasn’t visited', review.includes('no visit found'));
ok('the review offers suggestions', (await p.locator('.suggestion').count()) > 0);
ok('nothing changed before applying', (await p.locator('.src-row.todo').count()) === 2);

await p.locator('.suggestion input').first().fill('Sunset spot');
await p.locator('.suggestion').first().getByRole('button', { name: 'Add', exact: true }).click();
await p.waitForSelector('.suggestion.add');
ok('a suggestion can be added from the review', (await p.locator('.suggestion.add').count()) === 1);

await p.getByRole('button', { name: 'Apply', exact: true }).click();
await p.waitForSelector('.review', { state: 'detached' });
ok(
  'applying stores the Timeline',
  (await p.locator('.src-row').nth(1).textContent()).includes('visits and journeys'),
);
await p.click('text=Back to the journey');
await p.waitForURL(new RegExp(`/trips/${TRIP}$`));
const journey = await p.locator('.left').textContent();
ok('the journey shows the actual time', journey.includes('09:28'));
ok('the added suggestion is on the journey', journey.includes('Sunset spot'));

// Another import, discarded.
await p.goto(`${BASE}/trips/${TRIP}/sources`);
await p.setInputFiles('#timeline-file', 'data/mock/Timeline.json');
await p.getByRole('button', { name: 'Upload the trip’s days' }).click();
await p.waitForSelector('.review');
await p.getByRole('button', { name: 'Discard', exact: true }).click();
await p.waitForSelector('.review', { state: 'detached' });
ok(
  'a discarded import leaves nothing to review',
  (await p.locator('.src-run.quiet').count()) === 1,
);
ok('no page errors', errors.length === 0, errors.join('; '));

await browser.close();
console.log(R.join('\n'));
process.exit(R.some((l) => l.startsWith('FAIL')) ? 1 : 0);
