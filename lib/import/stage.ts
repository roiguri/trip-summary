// Imports through review (docs/DATA-DESIGN.md, "Import and publishing"; DESIGN.md, "Review (R3)"): a
// new trip is created straight from its plan; every later import waits as "pending" until the owner
// applies or discards it, so a published trip changes only when they say so.
import { merge, type MergeResult } from '../merge/index.ts';
import { rebuildJournal } from '../journal.ts';
import type { Pending, Store, TimelineSegment, TripPhoto } from '../store/index.ts';
import { deleteFolder } from '../media/storage.ts';
import { diffItinerary, importPlan, PlanImportError, readJarvisPlan } from './plan.ts';
import { checkSlice, TimelineImportError } from './timeline-store.ts';

export class StageError extends Error {}

/** A new trip from its Jarvis plan, as a draft. A trip that already exists is updated through review. */
export async function createTripFromPlan(store: Store, file: string, tripId: string, by: string) {
  if (await store.getTrip(tripId))
    throw new StageError('This trip is already in your journeys: open it to update its plan');
  return importPlan(store, file, tripId, by);
}

export async function stagePlan(store: Store, tripId: string, file: string, by: string) {
  const trip = await store.getTrip(tripId);
  if (!trip) throw new StageError(`No trip "${tripId}"`);
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
  return stage(store, tripId, by, summary, (importId, at) => ({
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
  return stage(store, tripId, by, summary, (importId, at) => ({
    importId,
    source: 'timeline',
    segments,
    at,
  }));
}

/** Starts a photo import: its photos are added batch by batch as they are copied. */
export async function beginPhotos(store: Store, tripId: string, sessionId: string, by: string) {
  if (!(await store.getTrip(tripId))) throw new StageError(`No trip "${tripId}"`);
  return stage(store, tripId, by, { photos: 0 }, (importId, at) => ({
    importId,
    source: 'photos',
    sessionId,
    photos: [],
    at,
  }));
}

/** Adds copied photos to the waiting photo import (a re-copied photo replaces itself). */
export async function addPendingPhotos(store: Store, tripId: string, photos: TripPhoto[]) {
  const pending = await store.getPending(tripId);
  if (pending?.source !== 'photos')
    throw new StageError('The photo import was replaced or discarded');
  const all = new Map(pending.photos.map((p) => [p.mediaId, p]));
  for (const p of photos) all.set(p.mediaId, p);
  await store.putPending(tripId, { ...pending, photos: [...all.values()] });
}

/** A discarded photo import's copied files go too, except those of photos already in the trip. */
async function dropFiles(store: Store, tripId: string, pending: Pending) {
  if (pending.source !== 'photos') return;
  const kept = new Set((await store.listPhotos(tripId)).map((p) => p.mediaId));
  await Promise.all(
    pending.photos
      .filter((p) => !kept.has(p.mediaId))
      .map((p) => deleteFolder(`trips/${tripId}/media/${p.mediaId}/`)),
  );
}

/** Records the import as pending and stores it, discarding any import still waiting. */
async function stage(
  store: Store,
  tripId: string,
  by: string,
  summary: Record<string, number>,
  make: (importId: string, at: string) => Pending,
) {
  const waiting = await store.getPending(tripId);
  if (waiting) {
    await store.setImportState(tripId, waiting.importId, 'discarded');
    await dropFiles(store, tripId, waiting);
  }
  const source = make('', '').source;
  const record = await store.recordImport(tripId, { source, by, summary, state: 'pending' });
  const pending = make(record.id, record.at);
  await store.putPending(tripId, pending);
  return { record, pending };
}

/** The trip merged as it is, and as it would be with the waiting import applied. */
export async function previewPending(
  store: Store,
  tripId: string,
): Promise<{
  pending: Pending;
  before: MergeResult;
  after: MergeResult;
  /** What the owner decided about each suggestion, by its key. */
  decisions: Record<string, 'add' | 'dismiss'>;
} | null> {
  const pending = await store.getPending(tripId);
  if (!pending) return null;
  const [plan, segments, photos, edits] = await Promise.all([
    store.getPlan(tripId),
    store.listTimeline(tripId),
    store.listPhotos(tripId),
    store.listEdits(tripId),
  ]);
  if (!plan) return null;
  // Suggestions stay listed in the review whatever was decided about them, with the decision shown
  // beside them, so both sides are merged without those decisions.
  const others = edits.filter((e) => e.target !== 'suggestion');
  const before = merge({ plan, segments, photos, edits: others });
  const after = merge({
    plan: pending.source === 'plan' ? pending.plan : plan,
    segments: pending.source === 'timeline' ? pending.segments : segments,
    photos: pending.source === 'photos' ? withPhotos(photos, pending.photos) : photos,
    edits: others,
  });
  const decisions: Record<string, 'add' | 'dismiss'> = {};
  for (const e of edits)
    if (
      e.target === 'suggestion' &&
      e.value === true &&
      (e.field === 'approved' || e.field === 'dismissed')
    )
      decisions[e.key] = e.field === 'approved' ? 'add' : 'dismiss';
  return { pending, before, after, decisions };
}

/** Applies the waiting import: it replaces its source, and the journal is rebuilt. */
export async function applyPending(store: Store, tripId: string) {
  const pending = await store.getPending(tripId);
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
  else await store.upsertPhotos(tripId, pending.photos);
  await store.deletePending(tripId);
  await store.setImportState(tripId, pending.importId, 'applied');
  await rebuildJournal(store, tripId);
}

export async function discardPending(store: Store, tripId: string) {
  const pending = await store.getPending(tripId);
  if (!pending) return;
  await store.deletePending(tripId);
  await store.setImportState(tripId, pending.importId, 'discarded');
  await dropFiles(store, tripId, pending);
}

const withPhotos = (current: TripPhoto[], added: TripPhoto[]) => {
  const all = new Map(current.map((p) => [p.mediaId, p]));
  for (const p of added) all.set(p.mediaId, p);
  return [...all.values()];
};
