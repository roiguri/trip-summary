// The home page's card: dates, counts and the cover (DESIGN.md, "Home (H1)", "Trip cover (K2)").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayCount, journeys, tripDates } from '../../lib/trip-labels.ts';
import { summarize } from '../../lib/summary.ts';
import { fixtureTrip } from '../../lib/data.ts';

test('dates read compactly within a month, across months and across years', () => {
  assert.equal(tripDates('2026-05-15', '2026-05-20'), 'MAY 15–20, 2026');
  assert.equal(tripDates('2026-05-30', '2026-06-02'), 'MAY 30 – JUN 2, 2026');
  assert.equal(tripDates('2026-12-30', '2027-01-02'), 'DEC 30, 2026 – JAN 2, 2027');
  assert.equal(tripDates('2026-05-15', '2026-05-15'), 'MAY 15, 2026');
  assert.equal(tripDates(null, null), 'NO DATES YET');
  assert.equal(dayCount('2026-05-15', '2026-05-20'), '6 DAYS');
  assert.equal(dayCount('2026-05-15', '2026-05-15'), '1 DAY');
});

test('the title counts journeys in words up to twelve', () => {
  assert.equal(journeys(1), 'One journey');
  assert.equal(journeys(4), 'Four journeys');
  assert.equal(journeys(23), '23 journeys');
});

const model = fixtureTrip('data/sample-trip.json');
const stops = model.days
  .flatMap((d) => d.entries)
  .filter((e) => e.type === 'place' || (e.type === 'lodging' && e.stay?.role !== 'checkout'));
const sources = { hasTimeline: true, hasPhotos: true };

test('without a pick, the cover is the first photo of the most photographed stop', () => {
  const s = summarize('t', model, [], sources);
  const most = Math.max(...stops.map((e) => e.photos.length));
  const best = stops.find((e) => e.photos.length === most)!;
  assert.equal(s.cover, best.photos[0].url);
  assert.equal(s.coverFrom, 'stop');
  assert.equal(s.photos, model.days.flatMap((d) => d.entries.flatMap((e) => e.photos)).length);
  assert.equal(s.stops, stops.length);
});

test('the owner’s pick wins; a pick that no longer exists is ignored', () => {
  const photo = model.days[2].entries.flatMap((e) => e.photos)[0];
  const edit = (value: string) => [
    { target: 'trip' as const, key: 't', field: 'cover', value, at: '', by: '' },
  ];
  assert.deepEqual(
    [
      summarize('t', model, edit(photo.id), sources).cover,
      summarize('t', model, edit(photo.id), sources).coverFrom,
    ],
    [photo.url, 'pick'],
  );
  assert.equal(summarize('t', model, edit('gone'), sources).coverFrom, 'stop');
});

test('a trip with no photos gets the paper cover', () => {
  const bare = {
    ...model,
    days: model.days.map((d) => ({ ...d, entries: d.entries.map((e) => ({ ...e, photos: [] })) })),
  };
  assert.deepEqual(
    [summarize('t', bare, [], sources).cover, summarize('t', bare, [], sources).coverFrom],
    [null, null],
  );
});
