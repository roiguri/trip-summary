// Interaction checks (verification Part 13) against the sample trip: selecting entries, map pins,
// day tracking, day albums, multi-day labels and the keyboard; on a phone, the timeline layout, the
// details sheet, the full-screen map and the menu. Usage: start the app, then
// `npm run check:interactions` (BASE_URL defaults to http://localhost:3000). Exits 1 on a failure.
import { chromium } from 'playwright';
import { signIn, TRIP } from './signed-in.mjs';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await signIn(p.context(), BASE);
  await p.goto(BASE + TRIP, { waitUntil: 'networkidle' });
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

  // Phone (390x844, touch): one-column timeline, the details sheet, the full-screen map, the menu.
  const ph = await (
    await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
  ).newPage();
  ph.on('pageerror', (e) => errs.push(String(e)));
  await signIn(ph.context(), BASE);
  await ph.goto(BASE + TRIP, { waitUntil: 'networkidle' });
  await ph.waitForTimeout(1500);
  const layout = await ph.evaluate(() => {
    const rail = document.querySelector('.entries').getBoundingClientRect().left + 2;
    const points = [...document.querySelectorAll('.entry')].map((e) => {
      const n = e.querySelector('.entry-node').getBoundingClientRect();
      const t = e.querySelector('strong') || e.querySelector('small');
      const r = document.createRange();
      r.selectNodeContents(t);
      const line = r.getClientRects()[0];
      return {
        dx: Math.abs(n.left + n.width / 2 - rail),
        dy: Math.abs(n.top + n.height / 2 - (line.top + line.height / 2)),
      };
    });
    const left = document.querySelector('.left');
    return {
      offRail: points.filter((q) => q.dx > 1).length,
      offTitle: points.filter((q) => q.dy > 1.5).length,
      overflow: left.scrollWidth - left.clientWidth,
    };
  });
  ok('phone: every point on the rail', layout.offRail === 0, layout.offRail);
  ok('phone: every point level with its title', layout.offTitle === 0, layout.offTitle);
  ok('phone: no sideways scroll', layout.overflow <= 0, layout.overflow);
  const sheet = () =>
    ph.evaluate(() => {
      const s = document.querySelector('.phone-sheet');
      return s ? Math.round(s.getBoundingClientRect().height) : 0;
    });
  const dragGrab = async (toY) => {
    const g = await ph.locator('.sheet-grab').boundingBox();
    await ph.mouse.move(g.x + 60, g.y + 20);
    await ph.mouse.down();
    const step = toY > g.y ? 40 : -40;
    for (let y = g.y + 20; step > 0 ? y < toY : y > toY; y += step)
      await ph.mouse.move(g.x + 60, y);
    await ph.mouse.up();
    await ph.waitForTimeout(700);
  };
  const mcway = await ph.evaluate(
    () =>
      [...document.querySelectorAll('.entry')].find((e) =>
        e.querySelector('strong')?.textContent.startsWith('Julia Pfeiffer'),
      ).dataset.entryId,
  );
  await ph.click(`[data-entry-id="${mcway}"] strong`);
  await ph.waitForTimeout(900);
  const opened = await sheet();
  ok('phone: tapping an entry opens the sheet at two thirds', Math.abs(opened - 563) <= 1, opened);
  await dragGrab(100);
  const pulled = await sheet();
  ok('phone: dragging the handle up expands it', pulled > opened + 20, `${opened} -> ${pulled}`);
  await dragGrab(830);
  ok('phone: dragging it down closes it', (await sheet()) === 0);
  await ph.click('.map-fab');
  await ph.waitForTimeout(2500);
  ok('phone: Map opens the full-screen map', !!(await ph.$('.phone-map')));
  await ph.click('.day-pills button:nth-child(4)');
  await ph.waitForTimeout(1500);
  ok(
    'phone: a day pill switches the day',
    (await ph.textContent('.phone-map-title')) === 'Day 4 · Mon, May 18',
  );
  const pinAt = await ph.evaluate(() => {
    const r = [...document.querySelectorAll('.map-pin.day-pin')]
      .map((e) => e.getBoundingClientRect())
      .find((r) => r.top > 80 && r.bottom < 600 && r.left > 0 && r.right < 390);
    return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (pinAt) await ph.mouse.click(pinAt.x, pinAt.y);
  await ph.waitForTimeout(800);
  ok('phone: tapping a pin shows its card', !!(await ph.$('.pin-card')));
  await ph.click('.pin-card');
  await ph.waitForTimeout(900);
  ok(
    'phone: Details opens the sheet over the map',
    (await sheet()) > 0 && !!(await ph.$('.phone-map')),
  );
  await ph.keyboard.press('Escape');
  await ph.waitForTimeout(600);
  ok(
    'phone: Escape closes the sheet, keeps the map',
    (await sheet()) === 0 && !!(await ph.$('.phone-map')),
  );
  await ph.keyboard.press('Escape');
  await ph.waitForTimeout(400);
  ok('phone: second Escape closes the map', !(await ph.$('.phone-map')));
  const cluster = await ph.evaluate(
    () =>
      [...document.querySelectorAll('.entry')].find(
        (e) => e.querySelector('strong')?.textContent === '14 photos',
      ).dataset.entryId,
  );
  await ph.click(`[data-entry-id="${cluster}"] strong`);
  await ph.waitForTimeout(900);
  await ph.click('.phone-sheet .photo');
  await ph.waitForTimeout(500);
  const count = () => ph.textContent('.light-count');
  const before = await count();
  await ph.mouse.move(300, 400);
  await ph.mouse.down();
  await ph.mouse.move(200, 405, { steps: 5 });
  await ph.mouse.move(80, 410, { steps: 5 });
  await ph.mouse.up();
  await ph.waitForTimeout(400);
  ok(
    'phone: swiping the viewer shows the next photo',
    (await count()) !== before && !!(await ph.$('.lightbox')),
    `${before} -> ${await count()}`,
  );
  ok('phone: no arrows on touch', !(await ph.isVisible('.light-nav.next')));
  await ph.keyboard.press('Escape');
  await ph.waitForTimeout(400);
  await ph.keyboard.press('Escape');
  await ph.waitForTimeout(600);
  await ph.click('.menu-button');
  ok(
    'phone: the menu holds the nav',
    ((await ph.textContent('.phone-menu')) || '').includes('WISHLIST'),
  );

  for (const e of errs) R.push('FAIL  console error: ' + e);
  console.log(R.join('\n'));
  await b.close();
  if (R.some((r) => r.startsWith('FAIL'))) process.exit(1);
})();
