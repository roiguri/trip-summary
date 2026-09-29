// Visual regression tests: screenshots of the agreed states of the sample trip, compared with the
// committed baselines in tests/visual/baseline.
//
//   npm run visual           compare; on a difference, writes baseline | now | diff images to
//                            tests/visual/output and exits 1
//   npm run visual:update    rewrite the baselines (after an intended visual change)
//
// Needs the app running on the seeded sample trip (BASE_URL, default http://localhost:3100).
// To be reproducible across machines the tests inject Liberation Sans (the page's Arial fallback on
// Linux) from tests/visual/fonts, hide the map's tile canvas (the tiles load from the internet and
// draw differently per machine; pins and markers stay), and turn off animations.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const UPDATE = process.argv.includes('--update');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const DIR = 'tests/visual';
// A pixel differs when a channel moves by more than PIXEL_DELTA; a state fails when more than
// MAX_RATIO of its pixels differ (absorbs anti-aliasing noise, catches any real change).
const PIXEL_DELTA = 24;
const MAX_RATIO = 0.001;

const font = (file, weight, style) =>
  `@font-face{font-family:Arial;font-weight:${weight};font-style:${style};src:url(data:font/ttf;base64,${readFileSync(`${DIR}/fonts/${file}`).toString('base64')})}`;
const STABLE_CSS = [
  font('LiberationSans-Regular.ttf', 400, 'normal'),
  font('LiberationSans-Bold.ttf', 700, 'normal'),
  font('LiberationSans-Italic.ttf', 400, 'italic'),
  '.maplibregl-canvas{visibility:hidden!important}',
  '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important;caret-color:transparent!important}',
].join('\n');

/** Entry id for a timeline title (ids are generated, titles come from the sample data). */
const entry = (p, title) =>
  p.evaluate(
    (t) =>
      [...document.querySelectorAll('.entry')].find(
        (e) => (e.querySelector('strong')?.textContent || '') === t,
      )?.dataset.entryId,
    title,
  );
const select = async (p, title) => p.click(`[data-entry-id="${await entry(p, title)}"]`);
const scrollTo = (p, y) => p.$eval('.left', (r, y) => r.scrollTo(0, y), y);
const scrollToDay = (p, day, offset = 0) =>
  p.$eval(
    '.left',
    (r, [day, offset]) => r.scrollTo(0, r.querySelector(`[data-day="${day}"]`).offsetTop + offset),
    [day, offset],
  );

/** Every agreed state, as a name and the steps that reach it from a fresh page load. */
const STATES = {
  opening: async () => {},
  day1: (p) => scrollToDay(p, '2026-05-15', 80),
  day2: (p) => scrollToDay(p, '2026-05-16', 80),
  'day3-multiday-end': (p) => scrollToDay(p, '2026-05-17', 80),
  'day4-lanes': (p) => scrollToDay(p, '2026-05-18', 80),
  'day4-notes': (p) => scrollToDay(p, '2026-05-18', 1000),
  'day5-changeover': (p) => scrollToDay(p, '2026-05-19', 80),
  'day6-transit': (p) => scrollToDay(p, '2026-05-20', 0),
  place: (p) => select(p, 'Point Lobos State Natural Reserve'),
  'place-long-note': async (p) => {
    await select(p, 'Julia Pfeiffer Burns State Park and the McWay Falls Overlook Trail');
    await p.waitForTimeout(400);
    await p.click('.panel .entry-caption-more');
  },
  'place-hebrew': (p) => select(p, 'Nepenthe'),
  stay: (p) => select(p, 'Big Sur River Lodge'),
  'transit-flight': (p) => select(p, 'Flight home to Denver'),
  note: (p) => select(p, 'Fog over the ridge'),
  photo: (p) => select(p, 'The road at golden hour'),
  cluster: (p) => select(p, '3 photos'),
  'cluster-page-2': async (p) => {
    await select(p, '14 photos');
    await p.waitForTimeout(400);
    await p.click('.panel button[aria-label="Next photos"]');
  },
  'day-album': (p) => p.click('.day-section[data-day="2026-05-15"] .day-banner'),
  'multiday-focus': async (p) => {
    await scrollToDay(p, '2026-05-18', 80);
    await select(p, 'Big Sur Parks Pass');
  },
  'map-folded': async (p) => {
    await select(p, 'Point Lobos State Natural Reserve');
    await p.waitForTimeout(400);
    await p.click('.map-card .card-close');
  },
  'all-closed': (p) => p.click('.map-card .card-close'),
  viewer: async (p) => {
    await select(p, '14 photos');
    await p.waitForTimeout(400);
    await p.click('.panel .photo');
  },
};

/** Compares two PNGs in the browser; returns the ratio of differing pixels and a diff image. */
async function compare(page, a, b) {
  return page.evaluate(
    async ({ a, b, delta }) => {
      const load = async (src) => {
        const i = new Image();
        i.src = src;
        await i.decode();
        return i;
      };
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return { ratio: 1, image: null };
      const w = ia.width,
        h = ia.height;
      const data = (img) => {
        const c = new OffscreenCanvas(w, h);
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, w, h).data;
      };
      const da = data(ia),
        db = data(ib);
      const out = new OffscreenCanvas(w * 3, h);
      const g = out.getContext('2d');
      g.drawImage(ia, 0, 0);
      g.drawImage(ib, w, 0);
      const diff = g.createImageData(w, h);
      let n = 0;
      for (let i = 0; i < da.length; i += 4) {
        const d = Math.max(
          Math.abs(da[i] - db[i]),
          Math.abs(da[i + 1] - db[i + 1]),
          Math.abs(da[i + 2] - db[i + 2]),
        );
        const hit = d > delta;
        if (hit) n++;
        const grey = (da[i] + da[i + 1] + da[i + 2]) / 3;
        diff.data[i] = hit ? 230 : grey * 0.35 + 160;
        diff.data[i + 1] = hit ? 40 : grey * 0.35 + 160;
        diff.data[i + 2] = hit ? 40 : grey * 0.35 + 160;
        diff.data[i + 3] = 255;
      }
      g.putImageData(diff, w * 2, 0);
      const blob = await out.convertToBlob({ type: 'image/png' });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000)
        s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return { ratio: n / (w * h), image: btoa(s) };
    },
    { a, b, delta: PIXEL_DELTA },
  );
}

(async () => {
  mkdirSync(`${DIR}/baseline`, { recursive: true });
  rmSync(`${DIR}/output`, { recursive: true, force: true });
  mkdirSync(`${DIR}/output`, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const tool = await context.newPage();
  const failed = [];
  const names = Object.keys(STATES).filter((n) => !ONLY || n === ONLY);
  for (const name of names) {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: STABLE_CSS });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    await STATES[name](page);
    await page.waitForTimeout(1200);
    await page.evaluate(() =>
      Promise.all(
        [...document.images]
          .filter((i) => !i.complete)
          .map((i) => new Promise((r) => (i.onload = i.onerror = r))),
      ),
    );
    const shot = await page.screenshot();
    const file = `${DIR}/baseline/${name}.png`;
    if (UPDATE || !existsSync(file)) {
      writeFileSync(file, shot);
      console.log(`${UPDATE ? 'updated' : 'new    '}  ${name}`);
      continue;
    }
    const url = (buf) => `data:image/png;base64,${buf.toString('base64')}`;
    const { ratio, image } = await compare(tool, url(readFileSync(file)), url(shot));
    const pct = (ratio * 100).toFixed(3);
    if (ratio > MAX_RATIO) {
      failed.push(name);
      writeFileSync(`${DIR}/output/${name}.actual.png`, shot);
      if (image) writeFileSync(`${DIR}/output/${name}.diff.png`, Buffer.from(image, 'base64'));
      console.log(`FAIL     ${name}  (${pct}% of pixels differ)`);
    } else console.log(`pass     ${name}  (${pct}%)`);
  }
  const stale = UPDATE
    ? []
    : readdirSync(`${DIR}/baseline`)
        .map((f) => f.replace(/\.png$/, ''))
        .filter((n) => !ONLY && !STATES[n]);
  for (const n of stale) console.log(`stale    ${n}  (baseline without a state; delete it)`);
  for (const e of errors) console.log(`error    ${e}`);
  await browser.close();
  if (failed.length || errors.length || stale.length) {
    console.log(
      `\n${failed.length} of ${names.length} states differ. See ${DIR}/output (baseline | now | diff).`,
    );
    process.exit(1);
  }
})();
