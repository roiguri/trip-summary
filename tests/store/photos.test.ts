// Copying picked photos into storage as a job, and staging them for review, on the emulators
// (Firestore, Storage), with the mock picker.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { getStore } from '../../lib/store/index.ts';
import { mockPicker, type Picker } from '../../lib/google/picker.ts';
import { copyItem } from '../../lib/media/copy.ts';
import { bucket } from '../../lib/media/storage.ts';
import {
  applyPending,
  beginPhotos,
  copyNextPhotos,
  createTripFromPlan,
  discardPending,
  previewPending,
  StageError,
} from '../../lib/import/stage.ts';
import { review } from '../../lib/review.ts';
import { jarvisFile } from '../helpers.ts';

const expected = JSON.parse(readFileSync('data/mock/expected.json', 'utf8'));
const store = getStore();
const TRIP = 'photos-trip';
const picker = mockPicker();
const read = async (path: string) => (await bucket().file(path).download())[0];
const exists = async (path: string) => (await bucket().file(path).exists())[0];
const items = async () => picker.listItems('mock');

before(async () => {
  await store.deleteTrip(TRIP);
  const sql = readFileSync('data/mock/jarvis.sql', 'utf8').replaceAll(
    `'${expected.trip}'`,
    `'${TRIP}'`,
  );
  await createTripFromPlan(store, jarvisFile(sql), TRIP, 'e');
});

test('a photo is stored at display and thumbnail size, with no metadata left', async () => {
  const [item] = await items();
  const p = await copyItem(TRIP, item, picker);
  const display = await sharp(await read(p.files.display!)).metadata();
  const thumb = await sharp(await read(p.files.thumb!)).metadata();
  assert.ok(Math.max(display.width!, display.height!) <= 2048);
  assert.ok(Math.max(thumb.width!, thumb.height!) <= 400);
  assert.equal(display.exif, undefined, 'no EXIF, so no location');
  assert.equal(thumb.exif, undefined);
});

test('a video is stored as it is, with a still and a thumbnail', async () => {
  const video = (await items()).find((i) => i.type === 'VIDEO')!;
  const p = await copyItem(TRIP, video, picker);
  for (const f of [p.files.video, p.files.still, p.files.thumb]) assert.ok(await exists(f!));
});

test('a copy job works through the picked items a batch at a time, then waits for review', async () => {
  const picked = (await items()).slice(0, 20);
  await beginPhotos(store, TRIP, 'mock', picked, 'e');
  let p = await copyNextPhotos(store, TRIP, picker, 8);
  assert.deepEqual([p.done, p.remaining], [8, 12]);
  while (p.remaining) p = await copyNextPhotos(store, TRIP, picker, 8);
  assert.equal(p.done, 20);
  assert.equal((await store.listPhotos(TRIP)).length, 0, 'nothing in the trip before applying');
  const preview = await previewPending(store, TRIP, 'photos');
  assert.equal(review(preview!.before, preview!.after).counts.photos, 20);
  await applyPending(store, TRIP, 'photos');
  assert.equal((await store.listPhotos(TRIP)).length, 20);
  const urls = (await store.getJournal(TRIP))!.trip.days.flatMap((d) =>
    d.entries.flatMap((e) => e.photos.map((x) => x.url)),
  );
  assert.ok(urls.length === 20 && urls.every((u) => u.startsWith(`/media/trips/${TRIP}/media/`)));
});

test('overlapping copy requests (a page reloaded mid-request) still count every item', async () => {
  const picked = (await items()).slice(20, 44);
  await beginPhotos(store, TRIP, 'mock', picked, 'e');
  const loop = async () => {
    let p = await copyNextPhotos(store, TRIP, picker, 8);
    while (p.remaining) p = await copyNextPhotos(store, TRIP, picker, 8);
    return p;
  };
  const [a, b] = await Promise.all([loop(), loop()]);
  for (const p of [a, b]) assert.equal(p.remaining, 0);
  const pending = await store.getPending(TRIP, 'photos');
  assert.deepEqual([pending?.done, pending?.failed], [24, 0]);
  await discardPending(store, TRIP, 'photos');
});

test('a re-pick skips photos already in the trip; applying before copying ends is refused', async () => {
  const all = await items();
  const { pending } = await beginPhotos(store, TRIP, 'mock', all.slice(15, 30), 'e');
  assert.equal(pending.source === 'photos' && pending.total, 10);
  await assert.rejects(applyPending(store, TRIP, 'photos'), /still copying/);
  await discardPending(store, TRIP, 'photos');
});

test('an item that fails is counted and skipped; an expired connection stops the job', async () => {
  const broken: Picker = {
    ...picker,
    fetchFile: async (item, s) =>
      item.id === 'mock-media-031'
        ? Promise.reject(new Error('Google Photos answered 500'))
        : picker.fetchFile(item, s),
  };
  const all = await items();
  await beginPhotos(store, TRIP, 'mock', all.slice(30, 33), 'e');
  const p = await copyNextPhotos(store, TRIP, broken, 8);
  assert.deepEqual([p.done, p.failed, p.remaining], [2, 1, 0]);
  await discardPending(store, TRIP, 'photos');

  const expired: Picker = {
    ...picker,
    fetchFile: async () => Promise.reject(new Error('Google Photos answered 403')),
  };
  await beginPhotos(store, TRIP, 'mock', all.slice(33, 35), 'e');
  await assert.rejects(
    copyNextPhotos(store, TRIP, expired, 8),
    (e) => e instanceof StageError && /expired/.test(e.message),
  );
  const pending = await store.getPending(TRIP, 'photos');
  assert.equal(
    pending!.done + pending!.failed,
    0,
    'nothing marked, so connecting again carries on',
  );
  await discardPending(store, TRIP, 'photos');
});

test('discarding a photo import removes its copied files, but not those already in the trip', async () => {
  const all = await items();
  const kept = (await store.listPhotos(TRIP))[0];
  await beginPhotos(store, TRIP, 'mock', all.slice(40, 41), 'e');
  await copyNextPhotos(store, TRIP, picker);
  const fresh = (await store.listPendingPhotos(TRIP))[0];
  await discardPending(store, TRIP, 'photos');
  assert.equal(await exists(fresh.files.display!), false);
  assert.equal(await exists(kept.files.display!), true);
  assert.equal((await store.listPendingPhotos(TRIP)).length, 0);
});
