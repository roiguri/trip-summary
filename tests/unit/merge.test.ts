// The merge rules (docs/DATA-DESIGN.md, "2. Merge rules") on the mock sources and their answer key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { merge, type MergeInput } from '../../lib/merge/index.ts';
import { readJarvisPlan } from '../../lib/import/plan.ts';
import { sliceTimeline } from '../../lib/import/timeline.ts';
import type { Edit } from '../../lib/store/types.ts';
import { jarvisFile, mockEdits, mockPhotos } from '../helpers.ts';

const expected = JSON.parse(readFileSync('data/mock/expected.json', 'utf8'));
const sample = JSON.parse(readFileSync('data/sample-trip.json', 'utf8'));
const TRIP = expected.trip;
const ids: Record<string, number> = expected.entryIds;

const plan = { ...readJarvisPlan(jarvisFile(), TRIP), importedAt: '2026-10-02T00:00:00.000Z' };
const window = { startDate: '2026-05-15', endDate: '2026-05-20', timezone: 'America/Los_Angeles' };
const segments = sliceTimeline(JSON.parse(readFileSync('data/mock/Timeline.json', 'utf8')), window);
const photos = mockPhotos();
const input = (edits: Edit[] = []): MergeInput => ({ plan, segments, photos, edits });
const edit = (e: Omit<Edit, 'at' | 'by'>): Edit => ({
  ...e,
  at: '2026-10-02T00:00:00.000Z',
  by: 'e',
});

const plain = merge(input());
const edited = merge(input(mockEdits(TRIP)));
const entries = (r = plain) => r.trip.days.flatMap((d) => d.entries);
const entry = (key: string, r = plain) => entries(r).find((e) => e.id === `i${ids[key]}`)!;

test('visits match planned entries as the answer key says, by place ID, distance or both', () => {
  for (const [key, want] of Object.entries(expected.matches) as [string, any][]) {
    const got = plain.matches[ids[key]];
    if (want === null) assert.equal(got, undefined, `${key} has no visit`);
    else assert.deepEqual(got, want, key);
  }
});

test('a matched place shows its actual times; a skipped one and a stay keep the plan’s', () => {
  assert.deepEqual(
    [entry('carmel-beach-visit').time, entry('carmel-beach-visit').end_time],
    ['09:28', '10:53'],
  );
  assert.equal(entry('aquarium-visit').time, '11:15'); // over an hour late, still matched
  assert.deepEqual(
    [entry('lovers-point-visit').time, entry('lovers-point-visit').end_time],
    ['15:00', '16:00'],
  );
  assert.equal(entry('inn').time, '15:00');
});

test('transit takes its mode and actual times from the overlapping activity', () => {
  const modes: Record<string, string> = {
    IN_PASSENGER_VEHICLE: 'car',
    IN_BUS: 'bus',
    IN_TRAIN: 'train',
    FLYING: 'flight',
  };
  for (const [key, mode] of Object.entries(expected.transitModes) as [string, string][])
    assert.equal(entry(key).mode, modes[mode], key);
  // Lands in Denver: the end time is read at the arrival's own offset.
  assert.deepEqual([entry('flight-home').time, entry('flight-home').end_time], ['12:30', '15:55']);
});

test('suggestions are exactly the unmatched stops and long journeys, without the noise', () => {
  assert.deepEqual(new Set(plain.suggestions.map((s) => s.key)), new Set(expected.suggestions));
  const drive = plain.suggestions.find((s) => s.kind === 'activity')!;
  assert.equal(drive.mode, 'car');
});

test('photos taken during a matched visit attach to its entry; others are loose moments', () => {
  const carmel = entry('carmel-beach-visit');
  assert.ok(carmel.photos.length >= 3);
  const loose = entries().filter((e) => e.type === 'photo' || e.type === 'cluster');
  const looseTimes = loose.flatMap((e) => e.photos.map((p) => `${p.date} ${p.time}`));
  assert.ok(looseTimes.includes('2026-05-19 08:10'), 'taken at a stop, not at the lodge');
});

test('loose photos group by a 45-minute gap, not by clock hour', () => {
  const groups = entries()
    .filter((e) => e.type === 'photo' || e.type === 'cluster')
    .map((e) => e.photos.map((p) => `${p.date} ${p.time}`));
  const groupOf = (t: string) => groups.findIndex((g) => g.includes(t));
  // 28 minutes apart across the hour: one group.
  assert.equal(groupOf('2026-05-15 16:42'), groupOf('2026-05-15 17:10'));
  // 65 minutes apart: two groups.
  assert.notEqual(groupOf('2026-05-18 19:05'), groupOf('2026-05-18 20:10'));
  // Within every group, no gap is longer than 45 minutes.
  for (const g of groups)
    for (let k = 1; k < g.length; k++)
      assert.ok(
        Date.parse(g[k].replace(' ', 'T') + 'Z') - Date.parse(g[k - 1].replace(' ', 'T') + 'Z') <=
          45 * 60_000,
      );
});

test('a photo’s local time comes from EXIF, else from the Timeline at that moment', () => {
  const noExif = photos.find((p) => p.offsetMin === null && p.kind === 'photo')!;
  const n = Number(noExif.mediaId.slice(-3)) - 1;
  const shown = entries()
    .flatMap((e) => e.photos)
    .find((p) => p.id === noExif.mediaId)!;
  assert.equal(shown.time, sample.photos[n].time);
});

test('a loose photo is placed where the Timeline puts its moment', () => {
  const p = entries().find((e) => e.time === '19:05' && e.type === 'photo')!.photos[0];
  assert.ok(p.lat !== null && Math.abs(p.lat - 36.27) < 0.5);
});

test('the sample’s edits give back its titles, captions and photo placements', () => {
  assert.equal(edited.trip.subtitle, sample.trip.subtitle);
  for (const d of sample.days.filter((d: any) => d.title))
    assert.equal(edited.trip.days.find((x) => x.date === d.date)!.title, d.title);
  const byId = new Map(entries(edited).flatMap((e) => e.photos.map((p) => [p.id, { e, p }])));
  sample.photos.forEach((sp: any, n: number) => {
    const got = byId.get(`mock-media-${String(n + 1).padStart(3, '0')}`)!;
    assert.equal(got.p.caption, sp.caption);
    if (sp.entry) assert.equal(got.e.id, `i${ids[sp.entry]}`, `photo ${n + 1} on ${sp.entry}`);
  });
  assert.deepEqual(edited.orphanEdits, []);
});

test('entry edits hide, retitle and retime; the owner wins over the Timeline', () => {
  const k = String(ids['carmel-beach-visit']);
  const r = merge(
    input([
      edit({ target: 'entry', key: String(ids['lunch']), field: 'hidden', value: true }),
      edit({ target: 'entry', key: k, field: 'start_time', value: '09:20' }),
      edit({ target: 'entry', key: k, field: 'title', value: 'The beach' }),
    ]),
  );
  assert.equal(
    entries(r).some((e) => e.id === `i${ids['lunch']}`),
    false,
  );
  assert.equal(entry('carmel-beach-visit', r).time, '09:20');
  assert.equal(entry('carmel-beach-visit', r).title, 'The beach');
});

test('an approved suggestion becomes an entry; a dismissed one goes away', () => {
  const [a, b] = expected.suggestions;
  const r = merge(
    input([
      edit({ target: 'suggestion', key: a, field: 'approved', value: true }),
      edit({ target: 'suggestion', key: a, field: 'title', value: 'Sunset spot' }),
      edit({ target: 'suggestion', key: b, field: 'dismissed', value: true }),
    ]),
  );
  assert.ok(entries(r).some((e) => e.title === 'Sunset spot' && e.type === 'place'));
  assert.deepEqual(
    r.suggestions.map((s) => s.key).filter((k) => k === a || k === b),
    [],
  );
});

test('an edit whose target is gone is listed, not dropped; one on a hidden entry is not', () => {
  const gone = edit({ target: 'entry', key: '9999', field: 'title', value: 'Old' });
  const hidden = String(ids['lunch']);
  const r = merge(
    input([
      gone,
      edit({ target: 'entry', key: hidden, field: 'hidden', value: true }),
      edit({ target: 'entry', key: hidden, field: 'notes', value: 'Kept for later' }),
    ]),
  );
  assert.deepEqual(r.orphanEdits, [gone]);
});
