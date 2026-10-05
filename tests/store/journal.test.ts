// The journal stays exactly what the merge says (docs/ARCHITECTURE.md, "Production"): written day
// by day only where something changed, with edit mode's data from the same merge, on the emulators.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '../../lib/firebase-admin.ts';
import { getStore } from '../../lib/store/index.ts';
import { importPlan } from '../../lib/import/plan.ts';
import { importTimeline } from '../../lib/import/timeline-store.ts';
import { sliceTimeline } from '../../lib/import/timeline.ts';
import { merge } from '../../lib/merge/index.ts';
import { readSources } from '../../lib/sources.ts';
import { editView } from '../../lib/edit-view.ts';
import {
  currentEditView,
  currentJournal,
  JOURNAL_VERSION,
  rebuildJournal,
} from '../../lib/journal.ts';
import { jarvisFile, mockPhotos } from '../helpers.ts';

const expected = JSON.parse(readFileSync('data/mock/expected.json', 'utf8'));
const store = getStore();
const TRIP = 'journal-trip';
const db = getFirestore(adminApp());
const journalDocs = () => db.collection('trips').doc(TRIP).collection('journal');

/** What the stored journal must equal: the merge of the stored sources and edits, now. */
const truth = async () => merge((await readSources(store, TRIP))!).trip;
const stored = async () => (await store.getJournal(TRIP))!.trip;
const dayTimes = async () =>
  new Map(
    (await journalDocs().get()).docs
      .filter((d) => d.id.startsWith('day-'))
      .map((d) => [d.id, d.updateTime.toMillis()]),
  );
/** Edit data as stored (JSON: keys whose value is undefined drop out), without its timings. */
const comparable = (e: object) => JSON.parse(JSON.stringify({ ...e, timing: '' }));

before(async () => {
  await store.deleteTrip(TRIP);
  const sql = readFileSync('data/mock/jarvis.sql', 'utf8').replaceAll(
    `'${expected.trip}'`,
    `'${TRIP}'`,
  );
  await importPlan(store, jarvisFile(sql), TRIP, 'test');
  const trip = (await store.getTrip(TRIP))!;
  await importTimeline(
    store,
    TRIP,
    sliceTimeline(JSON.parse(readFileSync('data/mock/Timeline.json', 'utf8')), trip),
    'test',
  );
  await store.upsertPhotos(
    TRIP,
    mockPhotos().map((p) => ({ ...p, addedAt: '2026-10-05T00:00:00.000Z' })),
  );
  await rebuildJournal(store, TRIP);
});

test('after a rebuild the stored journal is exactly the merge', async () => {
  assert.deepEqual(await stored(), await truth());
});

test('an edit that changes one day rewrites that day only, and the journal stays exact', async () => {
  const before = await dayTimes();
  const key = String(expected.entryIds['carmel-beach-visit']);
  await store.applyEdits(TRIP, [
    { target: 'entry', key, field: 'title', value: 'Carmel Beach, at last', by: 'test' },
  ]);
  await rebuildJournal(store, TRIP);
  const after = await dayTimes();
  const rewritten = [...after].filter(([id, t]) => before.get(id) !== t).map(([id]) => id);
  assert.deepEqual(rewritten, ['day-2026-05-15']);
  assert.deepEqual(await stored(), await truth());
});

test('an edit-mode-only edit (keeping new photos) rewrites no day, and edit mode sees it', async () => {
  const view = (await editView(store, TRIP, null))!;
  const news = view.edit.findings.find((f) => f.kind === 'photos');
  assert.ok(news && news.kind === 'photos');
  const before = await dayTimes();
  await store.applyEdits(
    TRIP,
    news.photoIds.map((id) => ({
      target: 'photo',
      key: id,
      field: 'seen',
      value: true,
      by: 'test',
    })),
  );
  await rebuildJournal(store, TRIP);
  assert.deepEqual(await dayTimes(), before, 'no day rewritten');
  assert.deepEqual(await stored(), await truth());
  const cached = (await currentEditView(store, TRIP))!;
  assert.equal(
    cached.edit.findings.some((f) => f.kind === 'photos' && f.entryKey === news.entryKey),
    false,
  );
});

test('edit mode reads what the save computed, equal to merging fresh', async () => {
  const cached = (await currentEditView(store, TRIP))!;
  const fresh = (await editView(store, TRIP, null))!;
  assert.deepEqual(cached.trip, fresh.trip);
  assert.deepEqual(comparable(cached.edit), comparable(fresh.edit));
});

test('a stored edit view from another build is not used', async () => {
  await store.putEditCache(TRIP, '1999-01-01T00:00:00.000Z', { stale: true });
  const view = (await currentEditView(store, TRIP))!;
  assert.ok(Array.isArray(view.edit.findings), 'merged fresh instead');
  await rebuildJournal(store, TRIP);
});

test('a journal of an older format is rebuilt when read', async () => {
  await journalDocs().doc('meta').update({ version: 1 });
  const j = (await currentJournal(store, TRIP))!;
  assert.equal(j.version, JOURNAL_VERSION);
  assert.deepEqual(j.trip, await truth());
});
