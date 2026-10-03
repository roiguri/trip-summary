// Imports through review (docs/DATA-DESIGN.md, "Import and publishing"; DESIGN.md, "Review (R3)"): a
// new trip is created straight from its plan; every later import waits as "pending" until the owner
// applies or discards it, so a published trip changes only when they say so. Each source waits on
// its own, so photos can copy in the background while the Timeline is reviewed.
import { merge, type MergeResult } from '../merge/index.ts';
import { rebuildJournal } from '../journal.ts';
import type { Pending, Store, TimelineSegment, TripPhoto } from '../store/index.ts';
import type { PickedItem, Picker } from '../google/picker.ts';
import { copyItem } from '../media/copy.ts';
import { deleteFolder } from '../media/storage.ts';
import { diffItinerary, importPlan, PlanImportError, readJarvisPlan } from './plan.ts';
import { checkSlice, TimelineImportError } from './timeline-store.ts';

export class StageError extends Error {}
type Source = Pending['source'];

/** A new trip from its Jarvis plan, as a draft. A trip that already exists is updated through review. */
export async function createTripFromPlan(store: Store, file: string, tripId: string, by: string) {
  if (await store.getTrip(tripId))
    throw new StageError('This trip is already in your journeys: open it to update its plan');
  return importPlan(store, file, tripId, by);
}

export async function stagePlan(store: Store, tripId: string, file: string, by: string) {
  if (!(await store.getTrip(tripId))) throw new StageError(`No trip "${tripId}"`);
  let rows;
  try {
    rows = readJarvisPlan(file, tripId);
  } catch (e) {
    throw new StageError(
      e instanceof PlanImportError ? e.message : 'That file could not be read as a Jarvis database',
    );
  }
  const current = await store.getPlan(tripId);
  const summary = diffItinerary(current?.itinerary ?? [], rows.itinerary);
  return stage(store, tripId, 'plan', by, summary, (importId, at) => ({
    importId,
    source: 'plan',
    plan: { ...rows, importedAt: at },
    at,
  }));
}

export async function stageTimeline(
  store: Store,
  tripId: string,
  segments: TimelineSegment[],
  by: string,
) {
  const trip = await store.getTrip(tripId);
  if (!trip) throw new StageError(`No trip "${tripId}"`);
  try {
    checkSlice(trip, segments);
  } catch (e) {
    throw new StageError(e instanceof TimelineImportError ? e.message : String(e));
  }
  const before = new Set((await store.listTimeline(tripId)).map((s) => s.key));
  const after = new Set(segments.map((s) => s.key));
  const summary = {
    visits: segments.filter((s) => s.kind === 'visit').length,
    activities: segments.filter((s) => s.kind === 'activity').length,
    added: [...after].filter((k) => !before.has(k)).length,
    removed: [...before].filter((k) => !after.has(k)).length,
  };
  return stage(store, tripId, 'timeline', by, summary, (importId, at) => ({
    importId,
    source: 'timeline',
    segments,
    at,
  }));
}

/** Starts a photo import from the picked items: they are kept, and copied a few at a time by
 *  copyNextPhotos. Items already in the trip are left out, so a re-pick never duplicates. */
export async function beginPhotos(
  store: Store,
  tripId: string,
  sessionId: string,
  items: PickedItem[],
  by: string,
) {
  if (!(await store.getTrip(tripId))) throw new StageError(`No trip "${tripId}"`);
  const inTrip = new Set((await store.listPhotos(tripId)).map((p) => p.mediaId));
  const fresh = items.filter((i) => !inTrip.has(i.id));
  const result = await stage(
    store,
    tripId,
    'photos',
    by,
    { picked: items.length, new: fresh.length },
    (importId, at) => ({
      importId,
      source: 'photos',
      sessionId,
      total: fresh.length,
      done: 0,
      failed: 0,
      at,
    }),
  );
  await store.putPickedItems(
    tripId,
    fresh.map((item) => ({ mediaId: item.id, item, done: false, failed: false })),
  );
  return result;
}

/** How many picked items to copy at once: enough to finish a large pick within Google's hour. */
export const COPY_AT_ONCE = 8;

/** Copies the next few picked items, in parallel, into storage and the waiting photo import. An item
 *  that fails is counted and skipped, so one bad file can't stall the job. */
export async function copyNextPhotos(
  store: Store,
  tripId: string,
  picker: Picker,
  n = COPY_AT_ONCE,
) {
  const pending = await store.getPending(tripId, 'photos');
  if (!pending) throw new StageError('The photo import was replaced or discarded');
  const next = await store.nextPicked(tripId, n);
  const results = await Promise.allSettled(next.map((r) => copyItem(tripId, r.item, picker)));
  const copied = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  const failed = next.filter((_, i) => results[i].status === 'rejected').map((r) => r.mediaId);
  // A refused download usually means Google's hour is up: stop rather than mark everything failed.
  const expired = results.some(
    (r) => r.status === 'rejected' && /\b(401|403)\b/.test(String(r.reason)),
  );
  if (expired && !copied.length)
    throw new StageError('The Google Photos connection expired: connect again to continue');
  if (copied.length) await store.putPendingPhotos(tripId, copied);
  await store.markPicked(
    tripId,
    copied.map((p) => p.mediaId),
    expired ? [] : failed,
  );
  const { done, failed: failedTotal, remaining } = await store.countPicked(tripId);
  await store.updatePending(tripId, 'photos', { done, failed: failedTotal });
  if (!remaining) await picker.deleteSession(pending.sessionId);
  return { total: pending.total, done, failed: failedTotal, remaining };
}

/** A discarded photo import's copied files go too, except those of photos already in the trip. */
async function dropFiles(store: Store, tripId: string, pending: Pending) {
  if (pending.source !== 'photos') return;
  const kept = new Set((await store.listPhotos(tripId)).map((p) => p.mediaId));
  const copied = await store.listPendingPhotos(tripId);
  await Promise.all(
    copied
      .filter((p) => !kept.has(p.mediaId))
      .map((p) => deleteFolder(`trips/${tripId}/media/${p.mediaId}/`)),
  );
}

/** Records the import as pending and stores it, discarding the import of the same source waiting. */
async function stage(
  store: Store,
  tripId: string,
  source: Source,
  by: string,
  summary: Record<string, number>,
  make: (importId: string, at: string) => Pending,
) {
  await discardPending(store, tripId, source);
  const record = await store.recordImport(tripId, { source, by, summary, state: 'pending' });
  const pending = make(record.id, record.at);
  await store.putPending(tripId, pending);
  return { record, pending };
}

/** The trip merged as it is, and as it would be with one waiting import applied. */
export async function previewPending(
  store: Store,
  tripId: string,
  source: Source,
): Promise<{ pending: Pending; before: MergeResult; after: MergeResult } | null> {
  const pending = await store.getPending(tripId, source);
  if (!pending) return null;
  const [plan, segments, photos, edits, waitingPhotos] = await Promise.all([
    store.getPlan(tripId),
    store.listTimeline(tripId),
    store.listPhotos(tripId),
    store.listEdits(tripId),
    source === 'photos' ? store.listPendingPhotos(tripId) : Promise.resolve([]),
  ]);
  if (!plan) return null;
  const before = merge({ plan, segments, photos, edits });
  const after = merge({
    plan: pending.source === 'plan' ? pending.plan : plan,
    segments: pending.source === 'timeline' ? pending.segments : segments,
    photos: withPhotos(photos, waitingPhotos),
    edits,
  });
  return { pending, before, after };
}

/** Applies one waiting import: it replaces (or adds to) its source, and the journal is rebuilt. */
export async function applyPending(store: Store, tripId: string, source: Source) {
  const pending = await store.getPending(tripId, source);
  if (!pending) throw new StageError('There is no import waiting');
  if (pending.source === 'plan') {
    const d = pending.plan.destination;
    const t = pending.plan.trip;
    await store.putTrip({
      tripId,
      title: String(t.title ?? d.name),
      destinationName: String(d.name),
      timezone: String(d.timezone),
      startDate: (t.start_date as string | null) ?? null,
      endDate: (t.end_date as string | null) ?? null,
    });
    await store.putPlan(tripId, pending.plan);
  } else if (pending.source === 'timeline') await store.replaceTimeline(tripId, pending.segments);
  else {
    if (pending.done + pending.failed < pending.total)
      throw new StageError('The photos are still copying');
    await store.upsertPhotos(tripId, await store.listPendingPhotos(tripId));
  }
  await store.deletePending(tripId, source);
  await store.setImportState(tripId, pending.importId, 'applied');
  await rebuildJournal(store, tripId);
}

export async function discardPending(store: Store, tripId: string, source: Source) {
  const pending = await store.getPending(tripId, source);
  if (!pending) return;
  await dropFiles(store, tripId, pending);
  await store.deletePending(tripId, source);
  await store.setImportState(tripId, pending.importId, 'discarded');
}

const withPhotos = (current: TripPhoto[], added: TripPhoto[]) => {
  const all = new Map(current.map((p) => [p.mediaId, p]));
  for (const p of added) all.set(p.mediaId, p);
  return [...all.values()];
};
