// Slicing and parsing the mock Timeline export (data/mock/Timeline.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  localMidnightUtc,
  parseLatLng,
  parseSegment,
  sliceTimeline,
  sliceWindow,
} from '../../lib/import/timeline.ts';

const timeline = JSON.parse(readFileSync('data/mock/Timeline.json', 'utf8'));
const expected = JSON.parse(readFileSync('data/mock/expected.json', 'utf8'));
const trip = { startDate: '2026-05-15', endDate: '2026-05-20', timezone: 'America/Los_Angeles' };
const slice = sliceTimeline(timeline, trip);
const keys = new Set(slice.map((s) => s.key));

test('the slice keeps every segment the merge needs, under the answer key’s keys', () => {
  const wanted = [
    ...Object.values(expected.matches).flatMap((m: any) => (m ? [m.segment] : [])),
    ...expected.suggestions,
    ...expected.filteredOut,
  ];
  for (const k of wanted) assert.ok(keys.has(k), k);
});

test('the slice leaves out segments beyond a day either side of the trip', () => {
  for (const k of expected.outsideWindow) assert.ok(!keys.has(k), k);
});

test('paths and memories are dropped; only visits and activities remain', () => {
  assert.ok(slice.every((s) => s.kind === 'visit' || s.kind === 'activity'));
  assert.equal(
    slice.length,
    timeline.semanticSegments.filter((s: any) => s.visit || s.activity).length - 3,
  );
});

test('the window is the local days, one either side, across a daylight-saving offset', () => {
  const { from, to } = sliceWindow(trip);
  assert.equal(new Date(from).toISOString(), '2026-05-14T07:00:00.000Z'); // local midnight, UTC-7
  assert.equal(new Date(to).toISOString(), '2026-05-22T07:00:00.000Z');
  // Winter in Los Angeles is UTC-8; Lisbon in summer is UTC+1.
  assert.equal(
    new Date(localMidnightUtc('2026-01-10', 'America/Los_Angeles')).toISOString(),
    '2026-01-10T08:00:00.000Z',
  );
  assert.equal(
    new Date(localMidnightUtc('2026-07-01', 'Europe/Lisbon')).toISOString(),
    '2026-06-30T23:00:00.000Z',
  );
  assert.throws(() => sliceWindow({ ...trip, endDate: null }), /needs dates/);
});

test('a segment that starts before the window but runs into it is kept', () => {
  const s = sliceTimeline(
    {
      semanticSegments: [
        {
          startTime: '2026-05-13T22:00:00.000-07:00',
          endTime: '2026-05-14T09:00:00.000-07:00',
          visit: { topCandidate: { placeId: 'ChIJxxxxxxxxxxxxxxxxxxxxxxx' } },
        },
      ],
    },
    trip,
  );
  assert.equal(s.length, 1);
});

test('locations are parsed from the export’s text, signs included', () => {
  assert.deepEqual(parseLatLng('36.5552000°, -121.9246000°'), [36.5552, -121.9246]);
  assert.deepEqual(parseLatLng('-33.8688°, 151.2093°'), [-33.8688, 151.2093]);
  assert.equal(parseLatLng('nowhere'), null);
  assert.equal(parseLatLng(undefined), null);
});

test('a visit and an activity are stored with the fields the merge reads', () => {
  const nested = slice.find((s) => s.kind === 'visit' && s.hierarchyLevel === 1)!;
  assert.ok(nested.placeId && nested.lat !== null && nested.lng !== null);
  const flight = slice.find((s) => s.mode === 'FLYING')!;
  assert.equal(flight.startOffsetMin, -420);
  assert.equal(flight.endOffsetMin, -360);
  assert.ok(flight.distanceMeters! > 1_000_000 && flight.endLat !== null);
  const noOffset = slice.find((s) => s.startOffsetMin === null);
  assert.ok(noOffset, 'a segment without offsets keeps null, not a guess');
});

test('a timelinePath or timelineMemory parses to nothing', () => {
  assert.equal(
    parseSegment({
      startTime: '2026-05-16T09:00:00.000-07:00',
      endTime: '2026-05-16T10:00:00.000-07:00',
    }),
    null,
  );
});

test('a file that is not a Timeline export is refused', () => {
  assert.throws(() => sliceTimeline({ timelineObjects: [] }, trip), /semanticSegments/);
});
