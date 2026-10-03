// Puts trips into the store for development and the tests. Emulators only: it refuses to run
// against a real project.
//   npm run seed                 # the sample trip (data/sample-trip.json) as the fixture the visual
//                                # tests lock, under its own trip ID
//   npm run seed -- <file.json>  # any other trip file the same way
//   npm run seed -- --mocks      # the mock sources through the real importers and the merge, as
//                                # "<sample id>-merged": what a real import of the sample looks like
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getStore } from '../lib/store/index.ts';
import { storeFixture } from '../lib/journal.ts';
import { importPlan } from '../lib/import/plan.ts';
import { sliceTimeline } from '../lib/import/timeline.ts';
import { importTimeline } from '../lib/import/timeline-store.ts';
import { rebuildJournal } from '../lib/journal.ts';
import { jarvisFile, mockEdits, mockPhotos } from '../lib/fixtures.ts';
import { mockViewer } from '../lib/auth/invites.ts';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    'Refusing to seed: FIRESTORE_EMULATOR_HOST is not set (run npm run emulators first).',
  );
  process.exit(1);
}
const store = getStore();
const SAMPLE = 'data/sample-trip.json';
const idOf = (file: string) =>
  (JSON.parse(readFileSync(file, 'utf8')) as { trip: { id: string } }).trip.id;

if (process.argv.includes('--mocks')) {
  const sampleId = idOf(SAMPLE);
  const id = `${sampleId}-merged`;
  await store.deleteTrip(id);
  const sql = readFileSync('data/mock/jarvis.sql', 'utf8').replaceAll(`'${sampleId}'`, `'${id}'`);
  await importPlan(store, jarvisFile(sql), id, 'seed');
  const trip = (await store.getTrip(id))!;
  await importTimeline(
    store,
    id,
    sliceTimeline(JSON.parse(readFileSync('data/mock/Timeline.json', 'utf8')), trip),
    'seed',
  );
  await store.upsertPhotos(id, mockPhotos());
  for (const e of mockEdits(id)) await store.setEdit(id, e);
  // A highlight, so the visual tests see one (DESIGN.md, "Highlight (H5)").
  const ids = JSON.parse(readFileSync('data/mock/expected.json', 'utf8')).entryIds;
  await store.setEdit(id, {
    target: 'entry',
    key: String(ids['point-lobos-visit']),
    field: 'highlighted',
    value: true,
    by: 'seed',
  });
  await rebuildJournal(store, id);
  console.log(`Seeded "${id}" from the mock sources`);
} else {
  const file = path.resolve(process.argv[2] ?? SAMPLE);
  const id = idOf(file);
  await storeFixture(store, file, id);
  await mockViewer(store, id);
  console.log(`Seeded "${id}" from ${path.relative(process.cwd(), file)}`);
}
