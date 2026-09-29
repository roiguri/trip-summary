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
import { STATES } from './states.mjs';

const A = process.env.BASE_A || 'http://localhost:3101';
const B = process.env.BASE_B || 'http://localhost:3100';
const MAX_REPORT = 60;
const PARALLEL = 4;

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
    const cls = el.classList.length ? '.' + [...el.classList].join('.') : '';
    const key = `${path} ${el.tagName.toLowerCase()}${cls}`;
    const r = el.getBoundingClientRect();
    const box = inMap
      ? ''
      : [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10).join();
    els[key] = [box, values(getComputedStyle(el), inMap)];
    for (const pe of ['::before', '::after']) {
      const cs = getComputedStyle(el, pe);
      if (cs.content !== 'none' && cs.content !== 'normal') els[key + pe] = ['', values(cs, inMap)];
    }
    [...el.children].forEach((c, i) => walk(c, `${path}/${i}`));
  };
  walk(document.body, '');
  return { props, els };
}

async function capture(page, base, state, action) {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await STATES[state](page);
  await page.waitForTimeout(1000);
  if (action) {
    const el = page.locator(action.selector).first();
    if (action.kind === 'hover') await el.hover({ force: true });
    else {
      await page.keyboard.press('Shift');
      await el.focus();
    }
    await page.waitForTimeout(700);
  }
  return page.evaluate(snapshot);
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
    if (x[0] !== y[0]) diffs.push(`${key}: box ${x[0]} -> ${y[0]}`);
    if (x[1] === y[1]) continue;
    const xv = x[1].split('\u0001'),
      yv = y[1].split('\u0001');
    a.props.forEach((p, i) => {
      if (xv[i] !== yv[i]) diffs.push(`${key}: ${p}: ${xv[i]} -> ${yv[i]}`);
    });
  }
  return diffs;
}

(async () => {
  const browser = await chromium.launch();
  const runs = [];
  for (const state of Object.keys(STATES)) {
    runs.push({ state });
    for (const selector of POINTER[state] || [])
      for (const kind of ['hover', 'focus']) runs.push({ state, action: { kind, selector } });
  }
  runs.push({ state: 'place', motion: 'reduce' }, { state: 'all-closed', motion: 'reduce' });
  const label = (run) =>
    `${run.state}${run.action ? ` ${run.action.kind} ${run.action.selector}` : ''}${run.motion ? ' (reduced motion)' : ''}`;
  async function shoot(base, run) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: run.motion || 'no-preference',
    });
    try {
      return await capture(await context.newPage(), base, run.state, run.action);
    } finally {
      await context.close();
    }
  }
  const results = new Array(runs.length);
  let next = 0;
  async function worker() {
    while (next < runs.length) {
      const i = next++;
      results[i] = compare(await shoot(A, runs[i]), await shoot(B, runs[i]));
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  await browser.close();
  let failed = 0;
  runs.forEach((run, i) => {
    const diffs = results[i];
    if (diffs.length) {
      failed++;
      console.log(`DIFF  ${label(run)}  (${diffs.length})`);
      for (const d of diffs.slice(0, MAX_REPORT)) console.log(`      ${d}`);
    } else console.log(`same  ${label(run)}`);
  });
  console.log(
    failed ? `\n${failed} of ${runs.length} states differ` : `\nall ${runs.length} states match`,
  );
  process.exit(failed ? 1 : 0);
})();
