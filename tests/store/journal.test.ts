// The journal in the store: what the page reads (on the emulators).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getStore } from '../../lib/store/index.ts';
import { fixtureTrip } from '../../lib/data.ts';
import { storeFixture } from '../../lib/journal.ts';
import { importPlan } from '../../lib/import/plan.ts';
import { jarvisFile } from '../helpers.ts';

const store = getStore();
const json = (x: unknown) => JSON.parse(JSON.stringify(x));

test('the sample stored as a journal reads back exactly as the fixture draws it', async () => {
  await storeFixture(store, 'data/sample-trip.json', 'j-sample');
  const journal = await store.getJournal('j-sample');
  assert.deepEqual(json(journal!.trip), json(fixtureTrip('data/sample-trip.json')));
  assert.equal((await store.getTrip('j-sample'))!.startDate, '2026-05-15');
});

test('a shorter journal leaves no old days behind', async () => {
  await storeFixture(store, 'data/sample-trip.json', 'j-short');
  const trip = fixtureTrip('data/sample-trip.json');
  await store.putJournal('j-short', {
    trip: { ...trip, days: trip.days.slice(0, 2) },
    suggestions: [],
    orphanEdits: [],
    builtAt: new Date().toISOString(),
  });
  assert.equal((await store.getJournal('j-short'))!.trip.days.length, 2);
});

test('an import rebuilds the journal, with its suggestions for edit mode', async () => {
  const expected = JSON.parse(readFileSync('data/mock/expected.json', 'utf8'));
  const id = 'j-import';
  await store.deleteTrip(id);
  const sql = readFileSync('data/mock/jarvis.sql', 'utf8').replaceAll(
    `'${expected.trip}'`,
    `'${id}'`,
  );
  await importPlan(store, jarvisFile(sql), id, 'editor@example.com');
  const journal = await store.getJournal(id);
  assert.equal(journal!.trip.days.length, 6);
  assert.deepEqual(journal!.suggestions, []); // no Timeline yet
});

test('a trip with no journal reads as none', async () => {
  assert.equal(await store.getJournal('j-none'), null);
});
