// The agreed states of the sample trip, as steps that reach each one from a fresh page load.
// Shared by the visual tests (scripts/visual.mjs) and the style comparison (scripts/style-diff.mjs).

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
export const STATES = {
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
