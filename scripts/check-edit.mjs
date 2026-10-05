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
const ok = (name, cond, extra = '') => {
  R.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` (${extra})` : ''}`);
  if (process.env.VERBOSE) console.error(R[R.length - 1]);
};

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
await p.waitForSelector('.copy-panel >> text=are in the trip', { timeout: 180_000 });
// The new photos' findings are kept, so the rest of the check sees only the Timeline's.
await p.goto(editing);
await p.waitForSelector('.review-step');
// Count only once nothing is saving (a chip being saved shows "Saving…" instead).
const settled = () =>
  p.waitForFunction(() => !document.querySelector('.fnd.saving'), null, { timeout: 15_000 });
for (let n = 0; n < 30; n++) {
  await settled();
  const left = await p.locator('.left .fnd.new-photos').count();
  if (!left) break;
  await p.locator('.left .fnd.new-photos').first().getByRole('button', { name: 'Keep' }).click();
  await p.waitForFunction(
    (c) =>
      !document.querySelector('.fnd.saving') &&
      document.querySelectorAll('.left .fnd.new-photos').length < c,
    left,
    { timeout: 15_000 },
  );
}

// Edit mode: the findings drawn on the timeline (DESIGN.md, "Edit mode, round 2", T1).
const until = (fn, arg) =>
  p.waitForFunction(fn, arg, { timeout: 15_000 }).then(
    () => true,
    () => false,
  );
const resolved = (on) =>
  p.locator('.switch input').evaluate((el, on) => el.checked !== on && el.click(), on);
const entry = (title) => p.locator('.left .entry', { hasText: title }).first();
const toReview = async () =>
  Number(
    (await p.locator('.review-step').textContent())
      .match(/(\d+) to review|of (\d+)/)
      ?.slice(1)
      .find(Boolean) ?? 0,
  );
await p.goto(journey);
await p.getByRole('link', { name: 'Edit', exact: true }).click();
await p.waitForSelector('.review-step');
const before = await toReview();
ok('the bar counts what the Timeline found', before > 0, before);
ok(
  'times, new stops and not-visited are drawn on the timeline',
  (await p.locator('.left .fnd', { hasText: 'Visited' }).count()) > 0 &&
    (await p.locator('.left .ghost-card').count()) > 0 &&
    (await p.locator('.left .fnd', { hasText: 'No visit found' }).count()) > 0,
);
await p.getByRole('button', { name: 'Next finding' }).click();
ok(
  'Next steps to the first finding',
  (await p.locator('.review-step').textContent()).includes(`1 of ${before}`),
);

// An answer shows Saving… until the page has it, then a ✓ with Undo on the entry. The page updates
// in place from the save's answer: no page request (reload or refresh) follows.
const pageLoads = [];
const countLoads = (r) =>
  r.url().includes(`/trips/${TRIP}`) && !r.url().includes('/api/') && pageLoads.push(r.url());
p.on('request', countLoads);
await entry('Carmel Beach').locator('.fnd').getByRole('button', { name: 'Use' }).click();
ok(
  'Use shows Saving… at once',
  (await entry('Carmel Beach').locator('.fnd.saving').count()) === 1 ||
    (await entry('Carmel Beach').locator('.fnd.done').count()) === 1,
);
ok(
  'using a time changes the journey, and says so with Undo',
  await until(() =>
    [...document.querySelectorAll('.left .entry')].some(
      (e) =>
        e.textContent.includes('Carmel Beach') &&
        e.textContent.includes('09:28') &&
        !e.querySelector('.fnd:not(.done)') &&
        e.querySelector('.fnd.done')?.textContent.includes('Using the Timeline’s times'),
    ),
  ),
);
p.off('request', countLoads);
ok('the page updates in place, without reloading', pageLoads.length === 0, pageLoads.join(' '));
await entry('Carmel Beach').locator('.fnd.done').getByRole('button', { name: 'Undo' }).click();
ok(
  'Undo puts the planned time back and the finding waits again',
  await until(() =>
    [...document.querySelectorAll('.left .entry')].some(
      (e) =>
        e.textContent.includes('Carmel Beach') &&
        e.textContent.includes('09:20') &&
        !e.querySelector('.fnd.done') &&
        e.querySelector('.fnd')?.textContent.includes('Visited'),
    ),
  ),
);
await entry('Carmel Beach').locator('.fnd').getByRole('button', { name: 'Use' }).click();
await until(() =>
  [...document.querySelectorAll('.left .entry')].some(
    (e) => e.textContent.includes('Carmel Beach') && e.querySelector('.fnd.done'),
  ),
);
await entry('Cypress & Salt Café').locator('.fnd').getByRole('button', { name: 'Ignore' }).click();
ok(
  'ignoring a time takes it off the timeline, and says so',
  await until(() =>
    [...document.querySelectorAll('.left .entry')].some(
      (e) =>
        e.textContent.includes('Cypress & Salt') &&
        !e.querySelector('.fnd:not(.done)') &&
        e.querySelector('.fnd.done')?.textContent.includes('Ignored'),
    ),
  ),
);
// Set aside, not gone (R1).
await resolved(true);
const ignored = entry('Cypress & Salt Café').locator('.fnd.set-aside');
ok(
  '"Show resolved" draws it faded',
  (await ignored.count()) === 1 && (await ignored.textContent()).includes('Ignored'),
);
await ignored.getByRole('button', { name: 'Bring back' }).click();
ok(
  'and Bring back makes it wait again',
  await until(() =>
    [...document.querySelectorAll('.left .entry')].some(
      (e) => e.textContent.includes('Cypress & Salt') && e.querySelector('.fnd:not(.set-aside)'),
    ),
  ),
);
await resolved(false);

// A stay: its actual check-in and check-out from the Timeline, as one finding (rule 8).
const inn = entry('Carmel Garden Inn');
ok(
  'a stay offers its actual check-in and check-out',
  ((await inn.locator('.fnd').first().textContent()) ?? '').includes('Checked in 15:20'),
  await inn.locator('.fnd').first().textContent(),
);
await inn.locator('.fnd').first().getByRole('button', { name: 'Use' }).click();
ok(
  'Use sets the stay’s check-in',
  await until(() =>
    [...document.querySelectorAll('.left .entry')].some(
      (e) =>
        e.textContent.includes('Carmel Garden Inn') && e.textContent.includes('CHECK-IN · 15:20'),
    ),
  ),
);

// Not visited: link a visit by hand.
await entry('Lovers Point').locator('.fnd').getByRole('button', { name: 'Link a visit' }).click();
await p.waitForSelector('.editor >> #ed-link');
const option = await p.locator('#ed-link option').nth(1).getAttribute('value');
await p.selectOption('#ed-link', option);
await p.waitForSelector('.editor >> text=Visit from your Timeline');
ok('linking a visit gives the entry its visit', true);
await p.getByRole('button', { name: 'Close' }).click();
ok(
  'and it is no longer "not visited" (its visit’s times are offered instead)',
  await until(
    () =>
      ![...document.querySelectorAll('.left .entry')].some(
        (e) => e.textContent.includes('Lovers Point') && e.textContent.includes('No visit found'),
      ),
  ),
);

// An unplanned stop: add it, named, keeping its times; dismiss another, then bring it back.
const stops = await p.locator('.left .ghost-card').count();
await p.locator('.left .ghost-card').first().getByRole('button', { name: 'Add…' }).click();
await p.waitForSelector('.editor[aria-label="A stop you didn’t plan"]');
ok(
  'a stop shows its time and a Google Maps link',
  (await p.locator('.sg-meta a', { hasText: 'Open in Google Maps' }).count()) === 1,
);
await p.fill('#sg-name', 'Sunset spot');
await p.getByRole('button', { name: 'Add to the journey' }).click();
ok(
  'an added stop takes its place on the journey, marked as added',
  await until(() =>
    [...document.querySelectorAll('.left .entry')].some(
      (e) =>
        e.textContent.includes('Sunset spot') && e.textContent.includes('ADDED FROM YOUR TIMELINE'),
    ),
  ),
);
await p.locator('.left .ghost-card').first().getByRole('button', { name: 'Dismiss' }).click();
ok(
  'dismissing a stop takes it off',
  await until((n) => document.querySelectorAll('.left .ghost-card').length === n, stops - 2),
);
await resolved(true);
await p
  .locator('.left .ghost-card.set-aside')
  .first()
  .getByRole('button', { name: 'Bring back' })
  .click();
ok(
  'a dismissed stop can be brought back',
  await until(
    (n) => document.querySelectorAll('.left .ghost-card:not(.set-aside)').length === n,
    stops - 1,
  ),
);
await resolved(false);

// The entry editor, opened with the pencil: highlight, travel mode, photos, hide and show, undo.
const open = async (title) => {
  await entry(title).locator('.pencil:visible').click();
  await p.waitForSelector(`.editor[aria-label="Edit ${title}"]`);
};
await open('Point Lobos State Natural Reserve');
await p.getByRole('button', { name: '★ Highlight' }).click();
ok(
  'a highlight shows its stamp on the journey',
  await until(() => !!document.querySelector('.left .entry .hl-stamp')),
);
await p.getByRole('button', { name: 'Close' }).click();
await open('Drive down Highway 1');
await p.getByRole('button', { name: 'Bus', exact: true }).click();
await p.waitForSelector('.ed-modes button[aria-pressed="true"] >> text=Bus');
ok('a leg’s travel mode can be chosen', true);
await p.getByRole('button', { name: 'Close' }).click();

// Main photos (MP1) and photo highlights (PH1).
await open('Carmel Beach');
const fourth = await p.locator('.ed-photo img').nth(3).getAttribute('src');
await p.locator('.ed-photo').nth(3).click();
await p.getByRole('button', { name: 'Show on the journey' }).click();
ok(
  'a picked photo is shown first on the journey',
  await until(
    (src) =>
      document.querySelector('[data-entry-id] .stack img') &&
      [...document.querySelectorAll('.left .entry')]
        .find((e) => e.textContent.includes('Carmel Beach'))
        ?.querySelector('.stack img')
        ?.getAttribute('src') === src,
    fourth,
  ),
);
// The second is a photo also among the first three by time, so it stays on the journey after undo.
await p.locator('.ed-photo').nth(1).click();
await p.getByRole('button', { name: '★ Highlight photo' }).click();
ok(
  'a highlighted photo gets its star',
  await until(() => !!document.querySelector('.left .photo-star')),
);
const photoCount = async (title) => {
  await open(title);
  const n = Number(
    (await p.locator('.ed-photos-head b').first().textContent()).match(/\d+/)?.[0] ?? 0,
  );
  await p.getByRole('button', { name: 'Close' }).click();
  return n;
};
await p.getByRole('button', { name: 'Close' }).click();
const lobosBefore = await photoCount('Point Lobos State Natural Reserve');
await open('Carmel Beach');
await p.locator('.ed-photo').nth(5).click();
await p.getByRole('button', { name: 'Move to…' }).click();
await p.locator('.ed-moveto button', { hasText: 'Point Lobos' }).click();
await p.waitForFunction(() => !document.querySelector('.ed-moveto'));
await p.getByRole('button', { name: 'Close' }).click();
await p.waitForTimeout(500);
ok(
  'a photo can be moved to another entry',
  (await photoCount('Point Lobos State Natural Reserve')) === lobosBefore + 1,
  lobosBefore,
);
await open('Carmel Beach');
await p.getByRole('button', { name: 'Undo my edits' }).click();
ok(
  'undo brings back the planned time',
  await until(() =>
    [...document.querySelectorAll('.left .entry')].some(
      (e) => e.textContent.includes('Carmel Beach') && e.textContent.includes('09:20'),
    ),
  ),
);
await p.getByRole('button', { name: 'Close' }).click();
await open('Cypress & Salt Café');
await p.getByRole('button', { name: 'Hide from the journey' }).click();
ok(
  'a hidden entry leaves the journey',
  await until(
    () =>
      ![...document.querySelectorAll('.left .entry:not(.ghost-entry)')].some((e) =>
        e.textContent.includes('Cypress & Salt'),
      ),
  ),
);
await resolved(true);
await p
  .locator('.left .ghost-card', { hasText: 'Cypress & Salt' })
  .getByRole('button', { name: 'Show again' })
  .click();
ok(
  'and can be shown again',
  await until(() =>
    [...document.querySelectorAll('.left .entry:not(.ghost-entry)')].some((e) =>
      e.textContent.includes('Cypress & Salt'),
    ),
  ),
);

// The place window (DESIGN.md, "Place window"): an entry's place, chosen from Google's places nearby
// (the mock on the emulators), keeping the plan's name; then back to the plan's.
const placeLine = () => p.locator('.editor .ed-place small').first().textContent();
await open('Point Lobos State Natural Reserve');
ok('an entry shows where its place comes from', (await placeLine()) === 'From the plan');
await p.locator('.editor .ed-place').getByRole('button', { name: 'Change' }).click();
await p.waitForSelector('.place-window .pw-list button[role="listitem"]');
ok(
  'the place window lists places nearby, with their type and distance',
  (await p.locator('.place-window .pw-list[aria-label="Places nearby"] button').count()) >= 3 &&
    /· \d+ (m|km)/.test(
      (await p
        .locator('.place-window .pw-list[aria-label="Places nearby"] button span')
        .first()
        .textContent()) ?? '',
    ),
);
await p.locator('.place-window .pw-list button', { hasText: 'Harbour Lookout' }).click();
await p.getByRole('button', { name: 'Use this place' }).click();
ok(
  'choosing a place keeps the plan’s name and records the choice',
  (await until(
    () =>
      document.querySelector('.editor .ed-place small')?.textContent ===
      'Chosen in the place window',
  )) &&
    (await p.locator('.editor[aria-label="Edit Point Lobos State Natural Reserve"]').count()) === 1,
);
await p.locator('.editor .ed-place').getByRole('button', { name: 'Change' }).click();
await p.getByRole('button', { name: 'Back to the plan’s place' }).click();
ok(
  'and it can go back to the plan’s place',
  await until(
    () => document.querySelector('.editor .ed-place small')?.textContent === 'From the plan',
  ),
);
await p.getByRole('button', { name: 'Close' }).click();

// With Google's name: the entry is renamed on the journey; Undo my edits restores it.
await open('Lovers Point Park');
await p.locator('.editor .ed-place').getByRole('button', { name: 'Change' }).click();
await p.waitForSelector('.place-window .pw-list button[role="listitem"]');
await p.locator('.place-window .pw-list button', { hasText: 'Old Temple' }).click();
await p.getByRole('radio', { name: 'Use Google’s name' }).click();
await p.getByRole('button', { name: 'Use this place' }).click();
ok(
  'with Google’s name, the entry takes it on the journey',
  await until(() =>
    [...document.querySelectorAll('.left .entry')].some((e) =>
      e.textContent.includes('Old Temple'),
    ),
  ),
);
await p.getByRole('button', { name: 'Undo my edits' }).click();
ok(
  'Undo my edits brings back its name and place',
  await until(
    () =>
      [...document.querySelectorAll('.left .entry')].some((e) =>
        e.textContent.includes('Lovers Point'),
      ) &&
      ![...document.querySelectorAll('.left .entry')].some((e) =>
        e.textContent.includes('Old Temple'),
      ),
  ),
);
await p.getByRole('button', { name: 'Close' }).click();

// An unplanned stop: "which place was this?" names it and fills the add form; then back to the
// Timeline's place.
await p
  .locator('.left .ghost-card', { has: p.getByRole('button', { name: 'It’s a planned stop' }) })
  .first()
  .getByRole('button', { name: 'Add…' })
  .click();
await p.waitForSelector('.editor[aria-label="A stop you didn’t plan"]');
await p.locator('.editor .ed-place').getByRole('button', { name: 'Choose' }).click();
await p.waitForSelector('.place-window .pw-list button[role="listitem"]');
await p.locator('.place-window .pw-list button', { hasText: 'Night Market' }).click();
await p.getByRole('button', { name: 'Use this place' }).click();
ok(
  'a stop takes the chosen place’s name, in its heading and the add form',
  (await until(() => document.querySelector('.editor .sg-name')?.textContent === 'Night Market')) &&
    (await p.inputValue('#sg-name')) === 'Night Market',
);
await p.locator('.editor .ed-place').getByRole('button', { name: 'Choose' }).click();
await p.getByRole('button', { name: 'Back to the Timeline’s place' }).click();
ok(
  'and it can go back to the Timeline’s place',
  await until(
    () =>
      document.querySelector('.editor .ed-place small')?.textContent ===
      'Where your Timeline put it',
  ),
);
await p.getByRole('button', { name: 'Close' }).click();

// After all those changes made in place, a fresh page from the server reads the same: nothing drifted.
// The ✓ chips of this session's answers are the page's own, and go with a reload by design.
const railText = () =>
  p.evaluate(() => {
    const rail = document.querySelector('.left .rail').cloneNode(true);
    rail.querySelectorAll('.fnd.done').forEach((e) => e.remove());
    document.body.append(rail);
    const text = rail.innerText;
    rail.remove();
    return text;
  });
const shown = await railText();
await p.reload();
await p.waitForSelector('.review-step');
const reloaded = await railText();
const firstDiff = [...shown].findIndex((c, i) => c !== reloaded[i]);
ok(
  'after the changes, a reload shows the same journey',
  shown === reloaded,
  firstDiff >= 0
    ? `differs at: ${JSON.stringify(shown.slice(firstDiff - 60, firstDiff + 60))} vs ${JSON.stringify(reloaded.slice(firstDiff - 60, firstDiff + 60))}`
    : '',
);

// Done: the journey keeps the edits, without the edit tools.
await p.getByRole('link', { name: 'Done' }).click();
await p.waitForURL(journey);
ok(
  'after Done, the highlights stay and the tools go',
  (await p.locator('.hl-stamp').count()) === 1 &&
    (await p.locator('.photo-star').count()) === 1 &&
    (await p.locator('.pencil, .fnd, .ghost-card').count()) === 0,
);

// A copy job this browser remembers, for an import that is gone (applied, discarded, or the data
// reset), is forgotten quietly, even when paused.
await p.evaluate(() =>
  localStorage.setItem(
    'ts_copy_job',
    JSON.stringify({ tripId: 'gone-trip', title: 'Gone', paused: true }),
  ),
);
await p.reload();
const forgotten = await p
  .waitForFunction(
    () => !localStorage.getItem('ts_copy_job') && !document.querySelector('.copy-panel'),
    null,
    {
      timeout: 15_000,
    },
  )
  .then(
    () => true,
    () => false,
  );
ok('a remembered copy job that no longer exists is forgotten', forgotten);

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
