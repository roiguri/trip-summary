// Style comparison for CSS refactors: loads every agreed state (plus hover and keyboard-focus
// states) from two running builds and compares the computed style and box of every element and of
// its ::before/::after, reporting any difference. Stricter than the screenshots: it also sees
// transitions, animations, cursors, and styles that only show on hover or focus.
//
//   BASE_A=http://localhost:3101 BASE_B=http://localhost:3100 node scripts/style-diff.mjs
//
// With CACHE_A=<file>, build A's snapshots are saved on the first run and reused after (for
// comparing a series of edits against one reference build).
//
// Both builds need the same seeded sample trip. The map's tiles are skipped; its markers are
// compared without their position (it depends on tile loading).
import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { STATES } from './states.mjs';

const A = process.env.BASE_A || 'http://localhost:3101';
const B = process.env.BASE_B || 'http://localhost:3100';
const MAX_REPORT = 60;
const CACHE_A = process.env.CACHE_A;
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

function snapshot() {
  const out = {};
  const inMap = (el) => !!el.closest('.map');
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10).join(',');
  };
  const styles = (cs, skipPosition) => {
    const o = {};
    for (let i = 0; i < cs.length; i++) {
      const p = cs[i];
      if (skipPosition && /^(transform|translate|top|left|right|bottom|inset)/.test(p)) continue;
      o[p] = cs.getPropertyValue(p);
    }
    return o;
  };
  const walk = (el, path) => {
    if (el.classList.contains('maplibregl-canvas-container')) return;
    const map = inMap(el);
    const key = `${path} ${el.tagName.toLowerCase()}${el.classList.length ? '.' + [...el.classList].join('.') : ''}`;
    out[key] = { box: map ? '' : box(el), style: styles(getComputedStyle(el), map) };
    for (const pe of ['::before', '::after']) {
      const cs = getComputedStyle(el, pe);
      if (cs.content !== 'none' && cs.content !== 'normal')
        out[`${key}${pe}`] = { box: '', style: styles(cs, map) };
    }
    [...el.children].forEach((c, i) => walk(c, `${path}/${i}`));
  };
  walk(document.body, '');
  return out;
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
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!a[key] || !b[key]) {
      diffs.push(`${key}: only in ${a[key] ? 'A' : 'B'}`);
      continue;
    }
    if (a[key].box !== b[key].box) diffs.push(`${key}: box ${a[key].box} -> ${b[key].box}`);
    for (const p of new Set([...Object.keys(a[key].style), ...Object.keys(b[key].style)]))
      if (a[key].style[p] !== b[key].style[p])
        diffs.push(`${key}: ${p}: ${a[key].style[p]} -> ${b[key].style[p]}`);
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
  const cached = CACHE_A && existsSync(CACHE_A) ? JSON.parse(readFileSync(CACHE_A, 'utf8')) : null;
  const shotsA = {};
  const results = new Array(runs.length);
  let next = 0;
  async function worker() {
    while (next < runs.length) {
      const i = next++;
      const run = runs[i];
      const a = cached?.[label(run)] ?? (await shoot(A, run));
      shotsA[label(run)] = a;
      results[i] = compare(a, await shoot(B, run));
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  if (CACHE_A && !cached) writeFileSync(CACHE_A, JSON.stringify(shotsA));
  let failed = 0;
  runs.forEach((run, i) => {
    const diffs = results[i];
    if (diffs.length) {
      failed++;
      console.log(`DIFF  ${label(run)}  (${diffs.length})`);
      for (const d of diffs.slice(0, MAX_REPORT)) console.log(`      ${d}`);
    } else console.log(`same  ${label(run)}`);
  });
  await browser.close();
  console.log(
    failed ? `\n${failed} of ${runs.length} states differ` : `\nall ${runs.length} states match`,
  );
  process.exit(failed ? 1 : 0);
})();
