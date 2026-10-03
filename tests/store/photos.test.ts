// Copying picked photos into storage and staging them for review, on the emulators (Firestore,
// Storage), with the mock picker.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { getStore } from '../../lib/store/index.ts';
import { mockPicker } from '../../lib/google/picker.ts';
import { copyItem } from '../../lib/media/copy.ts';
import { bucket } from '../../lib/media/storage.ts';
import {
  addPendingPhotos,
  applyPending,
  beginPhotos,
  createTripFromPlan,
  discardPending,
  previewPending,
} from '../../lib/import/stage.ts';
import { review } from '../../lib/review.ts';
import { jarvisFile } from '../helpers.ts';

const expected = JSON.parse(readFileSync('data/mock/expected.json', 'utf8'));
const store = getStore();
const TRIP = 'photos-trip';
const picker = mockPicker();
const read = async (path: string) => (await bucket().file(path).download())[0];
const exists = async (path: string) => (await bucket().file(path).exists())[0];

before(async () => {
  await store.deleteTrip(TRIP);
  const sql = readFileSync('data/mock/jarvis.sql', 'utf8').replaceAll(
    `'${expected.trip}'`,
    `'${TRIP}'`,
  );
  await createTripFromPlan(store, jarvisFile(sql), TRIP, 'e');
});

test('a photo is stored at display and thumbnail size, with no metadata left', async () => {
  const [item] = await picker.listItems('mock');
  const p = await copyItem(TRIP, item, picker);
  assert.equal(p.kind, 'photo');
  const display = await sharp(await read(p.files.display!)).metadata();
  const thumb = await sharp(await read(p.files.thumb!)).metadata();
  assert.ok(Math.max(display.width!, display.height!) <= 2048);
  assert.ok(Math.max(thumb.width!, thumb.height!) <= 400);
  assert.equal(display.exif, undefined, 'no EXIF, so no location');
  assert.equal(thumb.exif, undefined);
});

test('a video is stored as it is, with a still', async () => {
  const video = (await picker.listItems('mock')).find((i) => i.type === 'VIDEO')!;
  const p = await copyItem(TRIP, video, picker);
  assert.equal(p.kind, 'video');
  assert.ok(await exists(p.files.video!));
  assert.ok(await exists(p.files.still!));
});

test('picked photos wait for review, then apply into the trip', async () => {
  const items = (await picker.listItems('mock')).slice(0, 3);
  await beginPhotos(store, TRIP, 'mock', 'e');
  await addPendingPhotos(
    store,
    TRIP,
    await Promise.all(items.map((i) => copyItem(TRIP, i, picker))),
  );
  assert.equal((await store.listPhotos(TRIP)).length, 0);
  const preview = await previewPending(store, TRIP);
  const r = review(preview!.before, preview!.after);
  assert.equal(r.counts.photos, 3);
  await applyPending(store, TRIP);
  assert.equal((await store.listPhotos(TRIP)).length, 3);
  const journal = await store.getJournal(TRIP);
  const urls = journal!.trip.days.flatMap((d) =>
    d.entries.flatMap((e) => e.photos.map((p) => p.url)),
  );
  assert.ok(urls.length === 3 && urls.every((u) => u.startsWith(`/media/trips/${TRIP}/media/`)));
});

test('discarding a photo import removes its copied files, but not those already in the trip', async () => {
  const items = await picker.listItems('mock');
  const kept = (await store.listPhotos(TRIP))[0];
  await beginPhotos(store, TRIP, 'mock', 'e');
  const fresh = await copyItem(TRIP, items[5], picker);
  await addPendingPhotos(store, TRIP, [fresh, kept]);
  await discardPending(store, TRIP);
  assert.equal(await exists(fresh.files.display!), false);
  assert.equal(await exists(kept.files.display!), true);
});
