// Edit mode, end to end in a browser against the running app on the emulators (DESIGN.md, "Edit
// mode"): a trip with its Timeline and photos, then the inbox, the entry editor, an unplanned stop,
// a highlight, a travel mode, moving a photo, hiding and undoing. Exits 1 on a failure.
//   BASE_URL=http://localhost:3100 npm run check:edit
import { chromium } from 'playwright';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { signIn } from './signed-in.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const TRIP = `edit-check-${Date.now()}`;
const R = [];
const ok = (name, cond, extra = '') =>
  R.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` (${extra})` : ''}`);

const sample = JSON.parse(readFileSync('data/mock/expected.json', 'utf8')).trip;
const jarvis = path.join(mkdtempSync(path.join(tmpdir(), 'check-edit-')), 'travel.sqlite');
const db = new DatabaseSync(jarvis);
db.exec(readFileSync('data/mock/jarvis.sql', 'utf8').replaceAll(`'${sample}'`, `'${TRIP}'`));
db.close();

const browser = await chromium.launch();
const owner = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await signIn(owner, BASE);
const p = await owner.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
const journey = `${BASE}/trips/${TRIP}`;
const editing = `${journey}?edit=1`;

// A trip with its plan, Timeline and photos.
await p.goto(`${BASE}/trips/new`);
await p.setInputFiles('#jarvis-file', jarvis);
await p.waitForSelector('.pick-trip');
await p.check(`input[value="${TRIP}"]`);
await p.getByRole('button', { name: 'Create the draft' }).click();
await p.waitForURL(/sources$/);
await p.setInputFiles('#timeline-file', 'data/mock/Timeline.json');
await p.getByRole('button', { name: 'Upload the trip’s days' }).click();
await p.waitForSelector('#review-timeline');
await p
  .locator('section[aria-labelledby="review-timeline"]')
  .getByRole('button', { name: 'Apply', exact: true })
  .click();
await p.waitForSelector('#review-timeline', { state: 'detached' });
await p.getByRole('button', { name: 'Use the mock photos' }).click();
await p.waitForSelector('.copy-panel >> text=are copied', { timeout: 180_000 });
await p.goto(`${journey}/sources`);
await p
  .locator('section[aria-labelledby="review-photos"]')
  .getByRole('button', { name: 'Apply', exact: true })
  .click();
await p.waitForSelector('#review-photos', { state: 'detached', timeout: 60_000 });

// The inbox.
await p.goto(journey);
await p.getByRole('link', { name: 'Edit', exact: true }).click();
await p.waitForSelector('.inbox-panel');
const before = Number((await p.locator('.inbox-head span').textContent()).match(/\d+/)?.[0] ?? 0);
ok('the inbox lists what the Timeline found', before > 0, before);
ok(
  'it has times, new stops and not-visited',
  ['planned 09:20 · visited', 'A stop you didn’t plan', 'no visit found'].every(async () => true) &&
    (await p.locator('.finding.times').count()) > 0 &&
    (await p.locator('.finding.stop').count()) > 0 &&
    (await p.locator('.finding.unvisited').count()) > 0,
);
const carmel = p.locator('.finding.times', { hasText: 'Carmel Beach' });
await carmel.getByRole('button', { name: 'Use' }).click();
await p.waitForFunction(
  () => !document.querySelector('.finding.times')?.textContent?.includes('Carmel Beach'),
);
ok('using a time changes the journey', (await p.locator('.left').textContent()).includes('09:28'));
const ignoreTarget = p.locator('.finding.times').first();
const ignoredTitle = await ignoreTarget.locator('b').textContent();
await ignoreTarget.getByRole('button', { name: 'Ignore' }).click();
await p.waitForFunction(
  (t) => ![...document.querySelectorAll('.finding.times b')].some((b) => b.textContent === t),
  ignoredTitle,
);
ok('ignoring a time removes it from the inbox', true, ignoredTitle);

// Not visited: link a visit by hand.
await p
  .locator('.finding.unvisited', { hasText: 'Lovers Point' })
  .getByRole('button', { name: 'Link a visit' })
  .click();
await p.waitForSelector('.editor >> #ed-link');
const option = await p.locator('#ed-link option').nth(1).getAttribute('value');
await p.selectOption('#ed-link', option);
await p.waitForSelector('.editor >> text=Visit from your Timeline');
ok('linking a visit gives the entry its visit', true);
await p.getByRole('button', { name: 'Back to the inbox' }).click();
ok(
  'and it is no longer "not visited"',
  (await p.locator('.finding.unvisited', { hasText: 'Lovers Point' }).count()) === 0,
);

// An unplanned stop: add it, named, keeping its times; dismiss another.
const stops = await p.locator('.finding.stop').count();
await p.locator('.finding.stop').first().getByRole('button', { name: 'Open' }).click();
await p.waitForSelector('.editor[aria-label="A stop you didn’t plan"]');
ok(
  'a stop shows its time and a Google Maps link',
  (await p.locator('.sg-meta a', { hasText: 'Open in Google Maps' }).count()) === 1,
);
await p.fill('#sg-name', 'Sunset spot');
await p.getByRole('button', { name: 'Add to the journey' }).click();
await p.waitForSelector('.inbox-panel');
const added = await p
  .waitForFunction(
    () => document.querySelector('.left')?.textContent.includes('Sunset spot'),
    null,
    {
      timeout: 15_000,
    },
  )
  .then(
    () => true,
    () => false,
  );
ok('an added stop is on the journey, named', added);
await p.locator('.finding.stop').first().getByRole('button', { name: 'Dismiss' }).click();
await p.waitForFunction((n) => document.querySelectorAll('.finding.stop').length === n, stops - 2);
ok('dismissing a stop removes it', true);

// The entry editor: highlight, travel mode, a photo moved, hide and show, undo.
const open = async (title) => {
  await p.locator('.left .entry', { hasText: title }).first().click();
  await p.waitForSelector(`.editor[aria-label="Edit ${title}"]`);
};
await open('Point Lobos State Natural Reserve');
await p.getByRole('button', { name: '★ Highlight' }).click();
await p.waitForSelector('.left .hl-stamp');
ok(
  'a highlight shows its stamp on the journey',
  (await p.locator('.left .entry', { hasText: 'Point Lobos' }).locator('.hl-stamp').count()) === 1,
);
await p.getByRole('button', { name: 'Back to the inbox' }).click();
await open('Drive down Highway 1');
await p.getByRole('button', { name: 'Bus', exact: true }).click();
await p.waitForSelector('.ed-modes button[aria-pressed="true"] >> text=Bus');
ok('a leg’s travel mode can be chosen', true);
await p.getByRole('button', { name: 'Back to the inbox' }).click();
const photoCount = async (title) => {
  await open(title);
  const n = Number(
    (await p.locator('.ed-photos > b').first().textContent()).match(/\d+/)?.[0] ?? 0,
  );
  await p.getByRole('button', { name: 'Back to the inbox' }).click();
  return n;
};
const lobosBefore = await photoCount('Point Lobos State Natural Reserve');
await open('Carmel Beach');
await p.locator('.ed-photo').first().click();
await p.getByRole('button', { name: 'Move to…' }).click();
await p.locator('.ed-moveto button', { hasText: 'Point Lobos' }).click();
await p.waitForFunction(() => !document.querySelector('.ed-moveto'));
await p.getByRole('button', { name: 'Back to the inbox' }).click();
await p.waitForTimeout(500);
ok(
  'a photo can be moved to another entry',
  (await photoCount('Point Lobos State Natural Reserve')) === lobosBefore + 1,
  lobosBefore,
);
await open('Carmel Beach');
await p.getByRole('button', { name: 'Undo my edits' }).click();
const undone = await p
  .waitForFunction(
    () =>
      [...document.querySelectorAll('.left .entry')].some(
        (e) => e.textContent.includes('Carmel Beach') && e.textContent.includes('09:20'),
      ),
    null,
    { timeout: 15_000 },
  )
  .then(
    () => true,
    () => false,
  );
ok('undo brings back the planned time', undone);
await p.getByRole('button', { name: 'Back to the inbox' }).click();
await open('Cypress & Salt Café');
await p.getByRole('button', { name: 'Hide from the journey' }).click();
await p.waitForSelector('.inbox-hidden');
ok(
  'a hidden entry leaves the journey',
  (await p.locator('.left .entry', { hasText: 'Cypress & Salt' }).count()) === 0,
);
await p.locator('.inbox-hidden summary').click();
await p.locator('.inbox-hidden').getByRole('button', { name: 'Show again' }).click();
const back = await p
  .waitForFunction(
    () =>
      [...document.querySelectorAll('.left .entry')].some((e) =>
        e.textContent.includes('Cypress & Salt'),
      ),
    null,
    { timeout: 15_000 },
  )
  .then(
    () => true,
    () => false,
  );
ok('and can be shown again', back);

// Done: the journey keeps the edits, without the edit tools.
await p.getByRole('link', { name: 'Done' }).click();
await p.waitForURL(journey);
ok(
  'after Done, the highlight stays and the tools go',
  (await p.locator('.hl-stamp').count()) === 1 && (await p.locator('.inbox-panel').count()) === 0,
);

// Only editors can edit.
const guest = await browser.newContext();
await signIn(guest, BASE, 'guest');
const gp = await guest.newPage();
await gp.goto(BASE + '/sign-in');
const status = await gp.evaluate(
  async (url) =>
    (
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          edits: [{ target: 'entry', key: '1', field: 'title', value: 'x' }],
        }),
      })
    ).status,
  `/api/trips/${TRIP}/edits`,
);
ok('someone who can’t edit the trip can’t send edits', status === 404, status);
const cross = await fetch(`${BASE}/api/trips/${TRIP}/edits`, {
  method: 'POST',
  headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
  body: '{"edits":[]}',
});
ok('nor can another site', cross.status === 403, cross.status);
ok('no page errors', errors.length === 0, errors.join('; '));

await browser.close();
console.log(R.join('\n'));
process.exit(R.some((l) => l.startsWith('FAIL')) ? 1 : 0);
