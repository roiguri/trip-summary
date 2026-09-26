// Captures every locked journey state at 1440x900 for comparison with docs/reference.
// Usage: npm run build && npm run start, then: npm run capture [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:3100';
(async () => {
  const out = process.argv[2] || 'captures';
  mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  const shot = async (n) => {
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${out}/${n}.png` });
  };
  await shot('opening');

  for (let i = 0; i < 6; i++) {
    await p.$eval('.left', (r, y) => r.scrollTo(0, y), i * 820);
    await shot(`rail-${i}`);
  }
  const click = async (sel, name) => {
    const el = await p.$(sel);
    if (!el) {
      console.log('missing', sel);
      return;
    }
    await el.click();
    await shot(name);
  };
  await click('.type-transit', 'transit');
  await click('.type-note', 'note');
  await click('.type-lodging', 'lodging');
  await click('.type-photo', 'single');
  await click('.type-cluster', 'cluster');
  await click('.multiday-start', 'multiday-start');
  await p.$eval('.left', (r) => r.scrollTo(0, r.scrollHeight));
  await shot('multiday-end');
  await click('.day-banner', 'day-album');
  await click('.panel .photo', 'fullscreen');
  await p.keyboard.press('Escape');
  await p.$eval('.left', (r) => r.scrollTo(0, 0));
  await click('.type-place', 'place');
  await click('.card-close', 'collapsed');
  for (const r of ['small', 'current']) {
    await p.goto(BASE + '/?map=' + r);
    await p.waitForTimeout(1200);
    await shot('map-' + r);
  }

  await b.close();
})();
