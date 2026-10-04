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

const proposal = (key: string) => plain.proposals.find((p) => p.entryId === ids[key]);

test('the Timeline changes no planned entry by itself', () => {
  assert.deepEqual(
    [entry('carmel-beach-visit').time, entry('carmel-beach-visit').end_time],
    ['09:20', '10:45'],
  );
  assert.equal(entry('aquarium-visit').time, '10:00');
  assert.equal(entry('inn').time, '15:00');
  // A leg keeps the mode its title implies until the owner accepts the Timeline's.
  assert.equal(entry('drive-hwy1').mode, 'car');
});

test('a matched place gets its actual times as a proposal, even over an hour late', () => {
  assert.deepEqual(
    [proposal('carmel-beach-visit')?.start, proposal('carmel-beach-visit')?.end],
    ['09:28', '10:53'],
  );
  assert.equal(proposal('aquarium-visit')?.start, '11:15');
  assert.equal(proposal('lovers-point-visit'), undefined, 'skipped: nothing to propose');
  assert.equal(proposal('inn'), undefined, 'a stay keeps its booking');
});

test('a leg gets its mode and actual times as a proposal, read at each end’s own offset', () => {
  const modes: Record<string, string> = {
    IN_PASSENGER_VEHICLE: 'car',
    IN_BUS: 'bus',
    IN_TRAIN: 'train',
    FLYING: 'flight',
  };
  for (const [key, mode] of Object.entries(expected.transitModes) as [string, string][])
    // Proposed, unless the leg is already drawn that way at those times.
    assert.equal(proposal(key)?.mode ?? entry(key).mode, modes[mode], key);
  // Planned at the Timeline's times, the flight needs no proposal; given other times, the proposal
  // reads each end at its own offset.
  const flight = String(ids['flight-home']);
  const moved = merge(
    input([
      edit({ target: 'entry', key: flight, field: 'start_time', value: '00:01' }),
      edit({ target: 'entry', key: flight, field: 'end_time', value: '00:02' }),
    ]),
  ).proposals.find((p) => p.entryId === ids['flight-home']);
  assert.deepEqual([moved?.start, moved?.end], ['12:30', '15:55']);
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

test('entry edits hide, retitle and retime', () => {
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

// Edit mode's edits (DESIGN.md, "Edit mode").
test('the owner can link a visit to a planned entry: it takes that visit and its photos', () => {
  const stop = expected.suggestions.find(
    (k: string) => k.startsWith('visit:') && k.includes('2026-05-15'),
  );
  const key = String(ids['lovers-point-visit']);
  const r = merge(input([edit({ target: 'entry', key, field: 'visit', value: stop })]));
  assert.deepEqual(r.matches[key], { segment: stop, by: 'owner' });
  assert.equal(
    r.suggestions.some((s) => s.key === stop),
    false,
    'no longer a suggestion',
  );
  assert.ok(r.proposals.some((p) => p.entryId === ids['lovers-point-visit'] && p.segment === stop));
  assert.equal(r.unvisited.includes(ids['lovers-point-visit']), false);
  assert.ok(
    entry('lovers-point-visit', r).photos.length > 0,
    'the photos taken there move with it',
  );
});

test('unlinking a wrong match leaves the entry without a visit', () => {
  const key = String(ids['carmel-beach-visit']);
  const r = merge(input([edit({ target: 'entry', key, field: 'visit', value: 'none' })]));
  assert.equal(r.matches[key], undefined);
  assert.ok(r.unvisited.includes(ids['carmel-beach-visit']));
});

test('a proposal is gone once accepted or ignored', () => {
  const p = plain.proposals.find((x) => x.entryId === ids['carmel-beach-visit'])!;
  const key = String(p.entryId);
  const accepted = merge(
    input([
      edit({ target: 'entry', key, field: 'start_time', value: p.start }),
      edit({ target: 'entry', key, field: 'end_time', value: p.end }),
    ]),
  );
  assert.equal(
    accepted.proposals.some((x) => x.entryId === p.entryId),
    false,
  );
  assert.equal(entry('carmel-beach-visit', accepted).time, '09:28');
  const ignored = merge(
    input([edit({ target: 'entry', key, field: 'proposal', value: 'ignored' })]),
  );
  assert.equal(
    ignored.proposals.some((x) => x.entryId === p.entryId),
    false,
  );
  assert.equal(entry('carmel-beach-visit', ignored).time, '09:20');
});

test('a highlight and a chosen travel mode reach the drawing', () => {
  const r = merge(
    input([
      edit({
        target: 'entry',
        key: String(ids['point-lobos-visit']),
        field: 'highlighted',
        value: true,
      }),
      edit({ target: 'entry', key: String(ids['drive-hwy1']), field: 'mode', value: 'bus' }),
    ]),
  );
  assert.equal(entry('point-lobos-visit', r).highlighted, true);
  assert.equal(entry('carmel-beach-visit', r).highlighted, undefined, 'only where marked');
  assert.equal(entry('drive-hwy1', r).mode, 'bus');
});

test('clearing an entry’s times leaves it untimed', () => {
  const key = String(ids['lunch']);
  const r = merge(
    input([
      edit({ target: 'entry', key, field: 'start_time', value: '' }),
      edit({ target: 'entry', key, field: 'end_time', value: '' }),
    ]),
  );
  assert.deepEqual([entry('lunch', r).time, entry('lunch', r).end_time], ['', null]);
});

test('an added stop keeps its times, takes others, or none', () => {
  const [a] = expected.suggestions;
  const add = (times?: string) =>
    merge(
      input([
        edit({ target: 'suggestion', key: a, field: 'approved', value: true }),
        edit({ target: 'suggestion', key: a, field: 'title', value: 'Sunset spot' }),
        ...(times ? [edit({ target: 'suggestion', key: a, field: 'times', value: times })] : []),
      ]),
    );
  const find = (r: ReturnType<typeof merge>) => entries(r).find((e) => e.title === 'Sunset spot')!;
  assert.equal(find(add()).time, plain.suggestions.find((s) => s.key === a)!.time);
  assert.deepEqual(
    [find(add('17:00-18:00')).time, find(add('17:00-18:00')).end_time],
    ['17:00', '18:00'],
  );
  assert.equal(find(add('none')).time, '');
});

test('planned stops with no visit are listed, unless the owner said that’s fine', () => {
  assert.ok(plain.unvisited.includes(ids['lovers-point-visit']));
  const r = merge(
    input([
      edit({
        target: 'entry',
        key: String(ids['lovers-point-visit']),
        field: 'noVisit',
        value: true,
      }),
    ]),
  );
  assert.equal(r.unvisited.includes(ids['lovers-point-visit']), false);
  assert.deepEqual(
    merge({ plan, segments: [], photos, edits: [] }).unvisited,
    [],
    'nothing without a Timeline',
  );
});

test('what the owner set aside is kept, not dropped: ignored, dismissed, fine as it is', () => {
  const p = plain.proposals.find((x) => x.entryId === ids['carmel-beach-visit'])!;
  const [stop] = expected.suggestions;
  const r = merge(
    input([
      edit({ target: 'entry', key: String(p.entryId), field: 'proposal', value: 'ignored' }),
      edit({ target: 'suggestion', key: stop, field: 'dismissed', value: true }),
      edit({
        target: 'entry',
        key: String(ids['lovers-point-visit']),
        field: 'noVisit',
        value: true,
      }),
    ]),
  );
  assert.ok(r.setAside.ignored.some((x) => x.entryId === p.entryId));
  assert.ok(r.setAside.dismissed.some((s) => s.key === stop));
  assert.ok(r.setAside.fine.includes(ids['lovers-point-visit']));
  assert.deepEqual(plain.setAside, { dismissed: [], ignored: [], fine: [] });
});

test('an entry’s chosen photos come first, in order; a highlighted photo is marked', () => {
  const photosOf = entry('carmel-beach-visit').photos;
  const [a, b, c, d] = photosOf.map((x) => x.id);
  const key = String(ids['carmel-beach-visit']);
  const r = merge(
    input([
      edit({ target: 'entry', key, field: 'photos', value: `${d},${a}` }),
      edit({ target: 'photo', key: b, field: 'highlighted', value: true }),
    ]),
  );
  const ordered = entry('carmel-beach-visit', r).photos;
  assert.deepEqual(
    ordered.slice(0, 4).map((x) => x.id),
    [d, a, b, c],
  );
  assert.equal(ordered.find((x) => x.id === b)?.highlighted, true);
  assert.equal(ordered.find((x) => x.id === a)?.highlighted, undefined, 'only where marked');
});

test('a leg’s proposal settles once its times are used, its mode read from the title as drawn', () => {
  // A leg with no mode of its own, drawn by its title as the Timeline's mode, given other times.
  const key = Object.keys(expected.transitModes).find(
    (k) => plan.itinerary.find((r) => Number(r.entry_id) === ids[k])?.mode == null,
  )!;
  assert.ok(key, 'the mocks have such a leg');
  const id = String(ids[key]);
  const off = [
    edit({ target: 'entry', key: id, field: 'start_time', value: '00:01' }),
    edit({ target: 'entry', key: id, field: 'end_time', value: '00:02' }),
  ];
  const p = merge(input(off)).proposals.find((x) => x.entryId === ids[key])!;
  assert.ok(p, 'other times are proposed');
  const used = merge(
    input([
      edit({ target: 'entry', key: id, field: 'start_time', value: p.start }),
      edit({ target: 'entry', key: id, field: 'end_time', value: p.end }),
    ]),
  );
  assert.equal(
    used.proposals.some((x) => x.entryId === ids[key]),
    false,
    'and settled by using them',
  );
});
