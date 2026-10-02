// The store against the Firebase emulators (npm run test:store starts them). Uses the mock sources'
// shapes; the importers that produce these rows are tested on their own.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { getStore, type TimelineSegment, type TripPhoto } from '../../lib/store/index.ts';

const PROJECT = 'demo-trip-summary';
const FIRESTORE = `http://${process.env.FIRESTORE_EMULATOR_HOST}`;
const STORAGE = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`;
const store = getStore();

before(async () => {
  assert.ok(
    process.env.FIRESTORE_EMULATOR_HOST,
    'run through npm run test:store (needs the emulators)',
  );
  await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
});

const tripFields = (tripId: string, startDate: string | null) => ({
  tripId,
  title: `Trip ${tripId}`,
  destinationName: 'Monterey Coast',
  timezone: 'America/Los_Angeles',
  startDate,
  endDate: startDate,
});

const segment = (key: string, startUtc: string): TimelineSegment => ({
  key,
  kind: 'visit',
  startUtc,
  endUtc: startUtc,
  startOffsetMin: -420,
  endOffsetMin: null,
  probability: 0.8,
  lat: 36.5,
  lng: -121.9,
  placeId: 'ChIJmockcarmelbeachxxxxxxxx',
  semanticType: 'UNKNOWN',
  hierarchyLevel: 0,
  endLat: null,
  endLng: null,
  mode: null,
  distanceMeters: null,
});

test('a new trip is a draft; putting it again keeps its status and creation time', async () => {
  const first = await store.putTrip(tripFields('t-status', '2026-05-15'));
  assert.equal(first.status, 'draft');
  await store.setTripStatus('t-status', 'published');
  const again = await store.putTrip({ ...tripFields('t-status', '2026-05-15'), title: 'Renamed' });
  assert.equal(again.status, 'published');
  assert.equal(again.createdAt, first.createdAt);
  assert.equal((await store.getTrip('t-status'))?.title, 'Renamed');
  assert.equal(await store.getTrip('missing'), null);
});

test('trips are listed newest first', async () => {
  await store.putTrip(tripFields('t-old', '2024-01-01'));
  await store.putTrip(tripFields('t-new', '2027-01-01'));
  const ids = (await store.listTrips()).map((t) => t.tripId);
  assert.ok(ids.indexOf('t-new') < ids.indexOf('t-old'));
});

test('the plan round-trips as stored, and an oversized plan is refused', async () => {
  const plan = {
    destination: { destination_id: 1, name: 'Monterey Coast', timezone: 'America/Los_Angeles' },
    trip: { trip_id: 't-plan', title: null },
    places: [{ place_id: 3, title: 'Carmel Beach', lat: 36.55, lng: -121.92 }],
    itinerary: [
      { entry_id: 1, item_type: 'place', place_id: 3, start_date: '2026-05-15', notes: null },
    ],
    importedAt: '2026-10-02T10:00:00.000Z',
  };
  await store.putPlan('t-plan', plan);
  assert.deepEqual(await store.getPlan('t-plan'), plan);
  const huge = { ...plan, itinerary: [{ entry_id: 1, notes: 'x'.repeat(1_000_000) }] };
  await assert.rejects(store.putPlan('t-plan', huge), /too large/);
});

test('replacing the Timeline removes segments that left the slice', async () => {
  await store.replaceTimeline('t-tl', [
    segment('visit:2026-05-15T16:28:00.000Z:a', '2026-05-15T16:28:00.000Z'),
    segment('visit:2026-05-15T18:00:00.000Z:b', '2026-05-15T18:00:00.000Z'),
  ]);
  await store.replaceTimeline('t-tl', [
    segment('visit:2026-05-15T18:00:00.000Z:b', '2026-05-15T18:00:00.000Z'),
    segment('visit:2026-05-14T09:00:00.000Z:c', '2026-05-14T09:00:00.000Z'),
  ]);
  const keys = (await store.listTimeline('t-tl')).map((s) => s.key);
  assert.deepEqual(keys, ['visit:2026-05-14T09:00:00.000Z:c', 'visit:2026-05-15T18:00:00.000Z:b']);
});

test('more segments than one batch holds are all written', async () => {
  const many = Array.from({ length: 1001 }, (_, i) => {
    const t = new Date(Date.UTC(2026, 4, 15) + i * 60_000).toISOString();
    return segment(`visit:${t}:p${i}`, t);
  });
  await store.replaceTimeline('t-many', many);
  assert.equal((await store.listTimeline('t-many')).length, 1001);
});

test('photos are upserted by media ID', async () => {
  const photo = (mediaId: string, offsetMin: number | null): TripPhoto => ({
    mediaId,
    kind: 'photo',
    takenUtc: '2026-05-15T16:45:00Z',
    offsetMin,
    offsetSource: offsetMin === null ? null : 'exif',
    width: 4080,
    height: 3072,
    mimeType: 'image/jpeg',
    filename: 'PXL_20260515_164500000.jpg',
    files: {},
  });
  await store.upsertPhotos('t-ph', [photo('mock-media-001', null), photo('mock-media-002', -420)]);
  await store.upsertPhotos('t-ph', [photo('mock-media-001', -420)]);
  const photos = await store.listPhotos('t-ph');
  assert.equal(photos.length, 2);
  assert.ok(photos.every((p) => p.offsetMin === -420));
});

test('an edit of the same field replaces the last one; removing it clears it', async () => {
  const edit = {
    target: 'day' as const,
    key: '2026-05-15',
    field: 'title',
    by: 'editor@example.com',
  };
  await store.setEdit('t-ed', { ...edit, value: 'Carmel' });
  await store.setEdit('t-ed', { ...edit, value: 'Carmel & the coves' });
  await store.setEdit('t-ed', {
    target: 'entry',
    key: '7',
    field: 'hidden',
    value: true,
    by: 'editor@example.com',
  });
  const edits = await store.listEdits('t-ed');
  assert.equal(edits.length, 2);
  assert.equal(edits.find((e) => e.target === 'day')?.value, 'Carmel & the coves');
  await store.removeEdit('t-ed', 'day', '2026-05-15', 'title');
  assert.deepEqual(
    (await store.listEdits('t-ed')).map((e) => e.target),
    ['entry'],
  );
});

test('imports are logged newest first, and their state can change', async () => {
  const a = await store.recordImport('t-imp', {
    source: 'plan',
    by: 'e',
    summary: { added: 30 },
    state: 'applied',
  });
  await new Promise((r) => setTimeout(r, 5));
  const b = await store.recordImport('t-imp', {
    source: 'timeline',
    by: 'e',
    summary: { segments: 61 },
    state: 'pending',
  });
  await store.setImportState('t-imp', b.id, 'applied');
  const imports = await store.listImports('t-imp');
  assert.deepEqual(
    imports.map((i) => i.id),
    [b.id, a.id],
  );
  assert.equal(imports[0].state, 'applied');
});

test('deleting a trip removes everything under it', async () => {
  await store.putTrip(tripFields('t-del', '2026-05-15'));
  await store.replaceTimeline('t-del', [
    segment('visit:2026-05-15T16:28:00.000Z:a', '2026-05-15T16:28:00.000Z'),
  ]);
  await store.deleteTrip('t-del');
  assert.equal(await store.getTrip('t-del'), null);
  assert.equal((await store.listTimeline('t-del')).length, 0);
});

test('keys with a slash are refused rather than silently nested', async () => {
  await assert.rejects(store.getTrip('a/b'), /Invalid document ID/);
});

test('the security rules close Firestore and Storage to direct client access', async () => {
  await store.putTrip(tripFields('t-rules', '2026-05-15'));
  // No admin token: these requests are judged by the rules, as a browser's would be.
  const doc = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/trips/t-rules`,
  );
  assert.equal(doc.status, 403);
  const write = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/trips?documentId=x`,
    {
      method: 'POST',
      body: JSON.stringify({ fields: {} }),
    },
  );
  assert.equal(write.status, 403);
  const file = await fetch(`${STORAGE}/v0/b/${PROJECT}.appspot.com/o/media%2Fx.jpg?alt=media`);
  assert.equal(file.status, 403);
});
