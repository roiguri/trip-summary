// Style comparison for CSS refactors: loads every agreed state (plus hover and keyboard-focus
// states) from two running builds and compares the computed style and box of every element and of
// its ::before/::after, reporting any difference. Stricter than the screenshots: it also sees
// transitions, animations, cursors, and styles that only show on hover or focus.
//
//   BASE_A=http://localhost:3101 BASE_B=http://localhost:3100 npm run check:styles
//
// Both builds need the same seeded sample trip. The map's tiles are skipped; its markers are
// compared without their position (it depends on tile loading).
import { chromium } from 'playwright';
import { STATES, viewportOf } from './states.mjs';

const A = process.env.BASE_A || 'http://localhost:3101';
const B = process.env.BASE_B || 'http://localhost:3100';
const MAX_REPORT = Number(process.env.MAX_REPORT || 60);
const PARALLEL = 3;

/** Elements to hover and to focus with the keyboard, each in a state where it is on screen. */
const POINTER = {
  opening: [
    '.entry.type-place',
    '.entry.type-transit',
    '.entry.type-note',
    '.day-banner',
    '.whole-chip',
    '.map-card .card-close',
    '.stay-night',
  ],
  'day4-lanes': ['.multi-day-chip', '.multiday-end', '.multiday-lane path'],
  place: ['.panel .photo', '.panel-close', '.maps-link', '.entry-caption-more'],
  'cluster-page-2': ['.pagination button:not([disabled])'],
  'all-closed': ['.map-pill'],
  'map-folded': ['.map-card .card-head'],
  viewer: ['.light-close', '.light-nav.next', '.light-bar'],
};

/** In the page: every element's box and computed style, the values joined in property order. */
function snapshot() {
  const props = [...getComputedStyle(document.body)];
  const position = /^(transform|translate|top|left|right|bottom|inset)/;
  const els = {};
  const values = (cs, inMap) =>
    props.map((p) => (inMap && position.test(p) ? '' : cs.getPropertyValue(p))).join('\u0001');
  const walk = (el, path) => {
    if (el.classList.contains('maplibregl-canvas-container')) return;
    const inMap = !!el.closest('.map');
    // Keyed by position, so an element whose classes change is still compared (classes are a field).
    const key = `${path} ${el.tagName.toLowerCase()}`;
    const cls = [...el.classList].join('.');
    const r = el.getBoundingClientRect();
    const box = inMap
      ? ''
      : [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10).join();
    els[key] = [box, values(getComputedStyle(el), inMap), cls];
    for (const pe of ['::before', '::after']) {
      const cs = getComputedStyle(el, pe);
      if (cs.content !== 'none' && cs.content !== 'normal')
        els[key + pe] = ['', values(cs, inMap), cls];
    }
    [...el.children].forEach((c, i) => walk(c, `${path}/${i}`));
  };
  walk(document.body, '');
  return { props, els };
}

// The map's tiles and style load from the internet and render in software WebGL here, which made
// every load slow and variable; the map gets a blank style instead (markers are still compared).
const BLANK_STYLE = JSON.stringify({
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#d8e8e1' } }],
});

/** Waits until no animation or transition is running, scrolling has stopped and images have loaded. */
async function settle(page) {
  await page.waitForFunction(
    () => {
      const at = [
        window.scrollY,
        ...[...document.querySelectorAll('.left, .panel-body')].map((e) => e.scrollTop),
      ].join();
      const still = at === window.__settleAt;
      window.__settleAt = at;
      return (
        still &&
        document.getAnimations().every((a) => a.playState !== 'running') &&
        [...document.images].every((i) => i.complete)
      );
    },
    null,
    { polling: 100, timeout: 5000 },
  );
}

/**
 * Loads one state in one build and snapshots it, then each hover and keyboard-focus variant of it
 * on the same page. Returns the snapshots in order.
 */
async function captureState(context, base, state, actions) {
  const page = await context.newPage();
  await page.route(/openfreemap\.org/, (route) =>
    /\/styles\//.test(route.request().url())
      ? route.fulfill({ contentType: 'application/json', body: BLANK_STYLE })
      : route.abort(),
  );
  await page.goto(base, { waitUntil: 'load' });
  await settle(page);
  await STATES[state](page);
  // The state's last click can leave the pointer over something that moves under it; hover is
  // checked explicitly below, so the plain snapshot is taken with the pointer out of the way.
  const parked = { x: 1, y: page.viewportSize().height - 1 };
  await page.mouse.move(parked.x, parked.y);
  await settle(page);
  const shots = [await page.evaluate(snapshot)];
  for (const action of actions) {
    const el = page.locator(action.selector).first();
    if (action.kind === 'hover') await el.hover({ force: true });
    else {
      await page.keyboard.press('Shift');
      await el.focus();
    }
    await settle(page);
    shots.push(await page.evaluate(snapshot));
    // Back to the plain state: pointer to an inert spot, focus released.
    await page.mouse.move(parked.x, parked.y);
    await page.evaluate(() => document.activeElement?.blur());
    await settle(page);
  }
  await page.close();
  return shots;
}

function compare(a, b) {
  const diffs = [];
  for (const key of new Set([...Object.keys(a.els), ...Object.keys(b.els)])) {
    const x = a.els[key],
      y = b.els[key];
    if (!x || !y) {
      diffs.push(`${key}: only in ${x ? 'A' : 'B'}`);
      continue;
    }
    if (x[2] !== y[2]) diffs.push(`${key}: class ${x[2]} -> ${y[2]}`);
    if (x[0] !== y[0]) diffs.push(`${key}: box ${x[0]} -> ${y[0]}`);
    if (x[1] === y[1]) continue;
    const xv = x[1].split('\u0001'),
      yv = y[1].split('\u0001');
    a.props.forEach((p, i) => {
      if (xv[i] !== yv[i]) diffs.push(`${key}.${x[2]}: ${p}: ${xv[i]} -> ${yv[i]}`);
    });
  }
  return diffs;
}

(async () => {
  const browser = await chromium.launch();
  // One job per state (and motion setting); its hover/focus variants run on the same page.
  const jobs = Object.keys(STATES).map((state) => ({
    state,
    actions: (POINTER[state] || []).flatMap((selector) =>
      ['hover', 'focus'].map((kind) => ({ kind, selector })),
    ),
  }));
  jobs.push({ state: 'place', actions: [], motion: 'reduce' });
  jobs.push({ state: 'all-closed', actions: [], motion: 'reduce' });
  const label = (job, action) =>
    `${job.state}${action ? ` ${action.kind} ${action.selector}` : ''}${job.motion ? ' (reduced motion)' : ''}`;
  const contexts = {};
  async function contextFor(job) {
    const options = { ...viewportOf(job.state), reducedMotion: job.motion || 'no-preference' };
    const key = JSON.stringify(options);
    contexts[key] ??= await browser.newContext(options);
    return contexts[key];
  }
  const runs = [];
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++];
      const context = await contextFor(job);
      // A state one build can't reach (e.g. a phone state against a build without the phone
      // layout) is reported as skipped rather than stopping the run.
      const shots = await Promise.all(
        [A, B].map((base) =>
          captureState(context, base, job.state, job.actions).catch((e) => ({
            error: String(e.message || e).split('\n')[0],
          })),
        ),
      );
      const [a, b] = shots;
      if (a.error || b.error) {
        runs.push({
          label: label(job),
          skipped: `${a.error ? 'A' : 'B'}: ${(a.error || b.error).slice(0, 80)}`,
        });
        continue;
      }
      [null, ...job.actions].forEach((action, i) =>
        runs.push({ label: label(job, action), diffs: compare(a[i], b[i]) }),
      );
    }
  }
  const started = Date.now();
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  await browser.close();
  let failed = 0;
  runs.sort((x, y) => x.label.localeCompare(y.label));
  const skipped = runs.filter((r) => r.skipped);
  for (const { label, skipped: why } of skipped) console.log(`skip  ${label}  (${why})`);
  for (const { label, diffs } of runs.filter((r) => !r.skipped)) {
    if (diffs.length) {
      failed++;
      console.log(`DIFF  ${label}  (${diffs.length})`);
      for (const d of diffs.slice(0, MAX_REPORT)) console.log(`      ${d}`);
    } else console.log(`same  ${label}`);
  }
  const took = `${Math.round((Date.now() - started) / 1000)}s`;
  const compared = runs.length - skipped.length;
  const skip = skipped.length ? `, ${skipped.length} skipped` : '';
  console.log(
    failed
      ? `\n${failed} of ${compared} states differ${skip} (${took})`
      : `\nall ${compared} states match${skip} (${took})`,
  );
  process.exitCode = failed ? 1 : 0;
})();
