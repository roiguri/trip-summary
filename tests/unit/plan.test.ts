// The plan importer's reading side, on the mock Jarvis database (data/mock/jarvis.sql).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { diffItinerary, listJarvisTrips, readJarvisPlan } from '../../lib/import/plan.ts';
import { jarvisFile } from '../helpers.ts';

const expected = JSON.parse(readFileSync('data/mock/expected.json', 'utf8'));

const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

test('lists the trips, the current one first', () => {
  const trips = listJarvisTrips(jarvisFile());
  assert.deepEqual(
    trips.map((t) => [t.tripId, t.isCurrent]),
    [
      [expected.trip, true],
      ['mock-other', false],
    ],
  );
  assert.equal(trips[0].entries, Object.keys(expected.entryIds).length + 6); // plus the day tags
});

test("reads one trip's rows and nothing of the other trip", () => {
  const plan = readJarvisPlan(jarvisFile(), expected.trip);
  assert.equal(plan.trip.trip_id, expected.trip);
  assert.equal(plan.destination.timezone, 'America/Los_Angeles');
  assert.ok(plan.itinerary.every((r) => r.trip_id === expected.trip));
  // Jarvis's own IDs are kept, so edits keyed by them survive re-imports.
  const ids = new Set(plan.itinerary.map((r) => r.entry_id));
  for (const id of Object.values(expected.entryIds)) assert.ok(ids.has(id as number));
  assert.ok(
    plan.itinerary.some((r) => r.item_type === 'tag'),
    'day tags come along',
  );
});

test('takes only the places the itinerary references', () => {
  const plan = readJarvisPlan(jarvisFile(), expected.trip);
  const referenced = new Set(plan.itinerary.map((r) => r.place_id).filter((id) => id !== null));
  assert.deepEqual(new Set(plan.places.map((p) => p.place_id)), referenced);
  assert.ok(!plan.places.some((p) => p.title === 'Tram 28'), "the other trip's place is left out");
});

test('never changes the database file', () => {
  const file = jarvisFile();
  const before = hash(file);
  listJarvisTrips(file);
  readJarvisPlan(file, expected.trip);
  assert.equal(hash(file), before);
});

test('an unknown trip is refused with the trips that exist', () => {
  assert.throws(() => readJarvisPlan(jarvisFile(), 'nope'), /No trip "nope".*mock-other/);
});

test('a file that is not a Jarvis database is refused clearly', () => {
  assert.throws(
    () => listJarvisTrips(jarvisFile('CREATE TABLE notes (id INTEGER);')),
    /no "destinations" table/,
  );
  // The real schema with one needed column taken out, and no rows: only the shape matters.
  const schema = readFileSync('data/mock/jarvis.sql', 'utf8').split('BEGIN;')[0];
  const sql = schema.replace('google_place_id TEXT UNIQUE,', '');
  assert.throws(
    () => listJarvisTrips(jarvisFile(sql)),
    /"places" table is missing "google_place_id"/,
  );
});

test('a re-import is summarised by entry ID', () => {
  const row = (entry_id: number, notes: string | null) => ({ entry_id, notes });
  assert.deepEqual(
    diffItinerary(
      [row(1, null), row(2, 'a'), row(3, null)],
      [row(1, null), row(2, 'b'), row(4, null)],
    ),
    {
      added: 1,
      changed: 1,
      removed: 1,
      unchanged: 1,
    },
  );
});
