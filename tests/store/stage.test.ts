// Imports through review (lib/import/stage.ts), on the emulators.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { getStore } from '../../lib/store/index.ts';
import { sliceTimeline } from '../../lib/import/timeline.ts';
import {
  applyPending,
  createTripFromPlan,
  discardPending,
  previewPending,
  stagePlan,
  stageTimeline,
} from '../../lib/import/stage.ts';
import { jarvisFile } from '../helpers.ts';

const expected = JSON.parse(readFileSync('data/mock/expected.json', 'utf8'));
const store = getStore();
const TRIP = 'stage-trip';
const sql = () =>
  readFileSync('data/mock/jarvis.sql', 'utf8').replaceAll(`'${expected.trip}'`, `'${TRIP}'`);
const timeline = JSON.parse(readFileSync('data/mock/Timeline.json', 'utf8'));
const slice = async () => sliceTimeline(timeline, (await store.getTrip(TRIP))!);

before(async () => {
  await store.deleteTrip(TRIP);
  await createTripFromPlan(store, jarvisFile(sql()), TRIP, 'editor@example.com');
});

test('a new trip comes straight from its plan, as a draft; adding it twice is refused', async () => {
  assert.equal((await store.getTrip(TRIP))!.status, 'draft');
  await assert.rejects(
    createTripFromPlan(store, jarvisFile(sql()), TRIP, 'e'),
    /already in your journeys/,
  );
});

test('a staged Timeline waits for review and changes nothing until applied', async () => {
  await store.setTripStatus(TRIP, 'published');
  const journalBefore = await store.getJournal(TRIP);
  await stageTimeline(store, TRIP, await slice(), 'e');
  assert.equal((await store.listTimeline(TRIP)).length, 0);
  assert.deepEqual(await store.getJournal(TRIP), journalBefore);
  const preview = await previewPending(store, TRIP, 'timeline');
  assert.ok(
    Object.keys(preview!.after.matches).length > Object.keys(preview!.before.matches).length,
  );
  assert.equal((await store.listImports(TRIP))[0].state, 'pending');
});

test('applying it stores the slice, keeps the plan’s times, and offers the actual ones', async () => {
  await applyPending(store, TRIP, 'timeline');
  assert.ok((await store.listTimeline(TRIP)).length > 0);
  assert.equal(await store.getPending(TRIP, 'timeline'), null);
  assert.equal((await store.listImports(TRIP))[0].state, 'applied');
  const journal = (await store.getJournal(TRIP))!;
  const id = expected.entryIds['carmel-beach-visit'];
  assert.equal(journal.trip.days[0].entries.find((e) => e.id === `i${id}`)!.time, '09:20');
  assert.equal(journal.proposals.find((p) => p.entryId === id)?.start, '09:28');
  assert.ok((await store.getTrip(TRIP))!.summary!.hasTimeline);
});

test('each source waits on its own; a newer import of one source replaces it', async () => {
  const file = jarvisFile(sql());
  const db = new DatabaseSync(file);
  db.exec(
    `UPDATE itinerary SET title = 'Lunch by the sea' WHERE entry_id = ${expected.entryIds['lunch']}`,
  );
  db.close();
  const first = await stageTimeline(store, TRIP, (await slice()).slice(3), 'e');
  await stagePlan(store, TRIP, file, 'e');
  assert.equal(
    (await store.listPending(TRIP)).length,
    2,
    'a plan update leaves the waiting Timeline alone',
  );
  const second = await stageTimeline(store, TRIP, await slice(), 'e');
  const states = new Map((await store.listImports(TRIP)).map((i) => [i.id, i.state]));
  assert.equal(states.get(first.record.id), 'discarded');
  assert.equal(states.get(second.record.id), 'pending');
  const planBefore = await store.getPlan(TRIP);
  await discardPending(store, TRIP, 'plan');
  assert.deepEqual(await store.getPlan(TRIP), planBefore);
  assert.equal(await store.getPending(TRIP, 'plan'), null);
  assert.ok(
    await store.getPending(TRIP, 'timeline'),
    'discarding the plan leaves the Timeline waiting',
  );
  await discardPending(store, TRIP, 'timeline');
});

test('a slice outside the trip’s days is refused', async () => {
  const wide = sliceTimeline(timeline, {
    ...(await store.getTrip(TRIP))!,
    startDate: '2026-05-01',
    endDate: '2026-05-30',
  });
  await assert.rejects(stageTimeline(store, TRIP, wide, 'e'), /outside the trip/);
});
