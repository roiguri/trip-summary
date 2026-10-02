// Storing the mock Timeline slice (on the emulators).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getStore } from '../../lib/store/index.ts';
import { importPlan } from '../../lib/import/plan.ts';
import { sliceTimeline } from '../../lib/import/timeline.ts';
import { importTimeline } from '../../lib/import/timeline-store.ts';
import { jarvisFile } from '../helpers.ts';

const expected = JSON.parse(readFileSync('data/mock/expected.json', 'utf8'));
const timeline = JSON.parse(readFileSync('data/mock/Timeline.json', 'utf8'));
const store = getStore();
const TRIP = `${expected.trip}-tl`;

before(async () => {
  await store.deleteTrip(TRIP);
  const sql = readFileSync('data/mock/jarvis.sql', 'utf8').replaceAll(
    `'${expected.trip}'`,
    `'${TRIP}'`,
  );
  await importPlan(store, jarvisFile(sql), TRIP, 'editor@example.com');
});

test('the slice is stored and logged', async () => {
  const trip = (await store.getTrip(TRIP))!;
  const slice = sliceTimeline(timeline, trip);
  const { summary } = await importTimeline(store, TRIP, slice, 'editor@example.com');
  assert.equal(summary.added, slice.length);
  assert.equal(summary.visits + summary.activities, slice.length);
  assert.equal((await store.listTimeline(TRIP)).length, slice.length);
});

test('a re-import replaces the slice and counts what left it', async () => {
  const trip = (await store.getTrip(TRIP))!;
  const slice = sliceTimeline(timeline, trip).slice(2);
  const { summary } = await importTimeline(store, TRIP, slice, 'editor@example.com');
  assert.deepEqual([summary.added, summary.removed], [0, 2]);
});

test('segments outside the trip’s dates are refused, so no extra history is stored', async () => {
  const trip = (await store.getTrip(TRIP))!;
  // Sliced to a wider window than the trip's, as a careless client might send it.
  const outside = sliceTimeline(timeline, {
    ...trip,
    startDate: '2026-05-10',
    endDate: '2026-05-25',
  });
  await assert.rejects(
    importTimeline(store, TRIP, outside, 'editor@example.com'),
    /outside the trip/,
  );
});

test('a trip without a plan is refused', async () => {
  await assert.rejects(
    importTimeline(store, 'no-such-trip', [], 'editor@example.com'),
    /import its plan first/,
  );
});
