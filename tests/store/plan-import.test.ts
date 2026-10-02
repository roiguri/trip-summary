// Importing the mock plan into the store (on the emulators).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { getStore } from '../../lib/store/index.ts';
import { importPlan } from '../../lib/import/plan.ts';
import { jarvisFile } from '../helpers.ts';

const expected = JSON.parse(readFileSync('data/mock/expected.json', 'utf8'));
const store = getStore();
const TRIP = expected.trip;

test('the first import creates a draft trip with every entry added', async () => {
  await store.deleteTrip(TRIP);
  const { trip, summary } = await importPlan(store, jarvisFile(), TRIP, 'editor@example.com');
  assert.equal(trip.status, 'draft');
  assert.equal(trip.timezone, 'America/Los_Angeles');
  assert.equal(trip.startDate, '2026-05-15');
  const plan = await store.getPlan(TRIP);
  assert.equal(summary.added, plan!.itinerary.length);
  assert.equal((await store.listImports(TRIP))[0].source, 'plan');
});

test('a re-import records what changed and keeps the trip', async () => {
  const file = jarvisFile();
  const db = new DatabaseSync(file);
  db.exec(
    `UPDATE itinerary SET notes = 'Changed in Jarvis' WHERE entry_id = ${expected.entryIds['lunch']}`,
  );
  db.exec(`DELETE FROM itinerary WHERE entry_id = ${expected.entryIds['quiet-note']}`);
  db.exec(
    `INSERT INTO itinerary (trip_id, item_type, title, start_date) VALUES ('${TRIP}', 'note', 'New', '2026-05-17')`,
  );
  db.close();
  const created = (await store.getTrip(TRIP))!.createdAt;
  const { summary } = await importPlan(store, file, TRIP, 'editor@example.com');
  assert.deepEqual(
    { ...summary, unchanged: undefined },
    { added: 1, changed: 1, removed: 1, unchanged: undefined },
  );
  assert.equal((await store.getTrip(TRIP))!.createdAt, created);
  assert.equal((await store.listImports(TRIP)).length, 2);
});

test('a published trip is not changed by a re-import', async () => {
  await store.setTripStatus(TRIP, 'published');
  const before = await store.getPlan(TRIP);
  await assert.rejects(importPlan(store, jarvisFile(), TRIP, 'editor@example.com'), /published/);
  assert.deepEqual(await store.getPlan(TRIP), before);
  await store.deleteTrip(TRIP);
});
