// Interaction checks (verification Part 13) against the sample trip: selecting entries, map pins,
// day tracking, day albums, multi-day labels and the keyboard. Usage: start the app, then
// `npm run check:interactions` (BASE_URL defaults to http://localhost:3000). Exits 1 on a failure.
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const R = [];
  const ok = (name, cond, extra = '') => R.push(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
  const state = () =>
    p.evaluate(() => ({
      title: document.querySelector('.panel h2')?.textContent || null,
      active: document.querySelector('.entry.active')?.dataset.entryId || null,
      dayPins: [...document.querySelectorAll('.map-pin.day-pin')]
        .map((x) => x.textContent)
        .join(','),
      chosen: document.querySelector('.chosen-pin')?.title || null,
    }));
  const inView = (sel) =>
    p.$eval(sel, (e) => {
      const r = e.getBoundingClientRect(),
        L = document.querySelector('.left').getBoundingClientRect();
      return r.top >= L.top - 2 && r.top < L.bottom - 40;
    });
  // 1. click entry -> selects, scrolls into view, map day
  await p.click('[data-entry-id="i8"]');
  await p.waitForTimeout(1500);
  let s = await state();
  ok('click entry selects it', s.title === 'Garrapata State Park' && s.active === 'i8');
  ok('...entry in view', await inView('[data-entry-id="i8"]'));
  ok('...map shows its day', s.dayPins === '4,5', s.dayPins);
  ok('...pin highlighted', s.chosen === 'Garrapata State Park', s.chosen);
  // 2. map pin -> entry
  const pin = await p.evaluate(() =>
    [...document.querySelectorAll('.map-pin')].find((x) => x.title === 'Bixby Creek Bridge')
      ? 1
      : 0,
  );
  if (pin) {
    await p.evaluate(() =>
      [...document.querySelectorAll('.map-pin')]
        .find((x) => x.title === 'Bixby Creek Bridge')
        .click(),
    );
    await p.waitForTimeout(1500);
    s = await state();
    ok('map pin selects entry', s.title === 'Bixby Creek Bridge');
    ok('...and scrolls timeline to it', await inView(`[data-entry-id="${s.active}"]`));
  } else ok('map pin (Bixby) visible', false);
  // 3. manual scroll -> day tracking
  for (const d of ['2026-05-17', '2026-05-19']) {
    await p.evaluate((d) => {
      const root = document.querySelector('.left');
      root.scrollTo(0, document.querySelector(`[data-day="${d}"]`).offsetTop + 150);
    }, d);
    await p.waitForTimeout(1300);
    const dp = (await state()).dayPins;
    ok(`scroll to ${d} tracks day`, d === '2026-05-17' ? dp === '6,7' : dp === '12', dp);
  }
  // 4. day banner -> album
  await p.click('.day-section[data-day="2026-05-16"] .day-banner');
  await p.waitForTimeout(1300);
  s = await state();
  ok('day banner opens album', s.title === 'The long way south', s.title);
  // 5. multi-day chip -> selects span start
  await p.evaluate(() => document.querySelector('.multi-day-chip').click());
  await p.waitForTimeout(1300);
  s = await state();
  ok('later-day label selects the event', s.title === 'Coast Path Walk', s.title);
  // 6. keyboard: tab to an entry, Enter
  await p.click('.whole-chip');
  await p.waitForTimeout(500);
  await p.evaluate(() => document.querySelector('[data-entry-id="i2"]').focus());
  await p.keyboard.press('Enter');
  await p.waitForTimeout(1200);
  s = await state();
  ok('Enter on focused entry selects it', s.title === 'Point Lobos State Natural Reserve', s.title);
  const focusVisible = await p.evaluate(() => {
    const e = document.querySelector('[data-entry-id="i3"]');
    e.focus();
    return getComputedStyle(e).outlineStyle + ' ' + getComputedStyle(e).outlineWidth;
  });
  ok('focused entry shows an outline', !focusVisible.startsWith('none'), focusVisible);
  // Tab order sample
  await p.evaluate(() => document.body.focus());
  const order = [];
  for (let i = 0; i < 12; i++) {
    await p.keyboard.press('Tab');
    order.push(
      await p.evaluate(() => {
        const a = document.activeElement;
        return (
          (a.className || a.tagName).toString().split(' ')[0] +
          (a.dataset?.entryId ? ':' + a.dataset.entryId : '')
        );
      }),
    );
  }
  R.push('INFO  tab order: ' + order.join(' > '));
  // 7. Escape closes details?
  await p.keyboard.press('Escape');
  await p.waitForTimeout(700);
  s = await state();
  ok('Escape closes the detail card', !s.title);
  // 8. photo in panel via keyboard
  await p.click('[data-entry-id="i2"]');
  await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('.panel .photo').focus());
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const lb = !!(await p.$('.lightbox'));
  ok('Enter on gallery photo opens viewer', lb);
  if (lb) {
    ok(
      'viewer takes focus',
      await p.evaluate(() => !!document.activeElement?.closest('.lightbox')),
    );
    const inside = [];
    for (let i = 0; i < 5; i++) {
      await p.keyboard.press('Tab');
      inside.push(await p.evaluate(() => !!document.activeElement?.closest('.lightbox')));
    }
    ok('Tab stays inside the viewer', inside.every(Boolean));
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
    ok(
      'Escape closes viewer, keeps details open',
      !(await p.$('.lightbox')) && !!(await state()).title,
    );
    ok(
      'focus returns to the photo',
      await p.evaluate(() => !!document.activeElement?.closest('.panel .photo, .photo')),
    );
    await p.keyboard.press('Escape');
    await p.waitForTimeout(700);
    ok('second Escape closes details', !(await state()).title);
  }
  // 9. See more doesn't select
  for (const e of errs) R.push('FAIL  console error: ' + e);
  console.log(R.join('\n'));
  await b.close();
  if (R.some((r) => r.startsWith('FAIL'))) process.exit(1);
})();
