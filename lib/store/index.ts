// Every read and write of the app's data goes through here (docs/ARCHITECTURE.md, "Rules that keep it
// portable"): moving off Firebase means rewriting this module, not the app.
import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, type Firestore, type DocumentReference } from 'firebase-admin/firestore';
import type {
  Edit,
  EditTarget,
  ImportRecord,
  Journal,
  PlanSource,
  Trip,
  TripPhoto,
  TripStatus,
  TimelineSegment,
} from './types.ts';

export type * from './types.ts';

/** Firestore takes at most 500 writes per batch. */
const BATCH = 400;
/** A document holds at most 1 MiB; refuse well before, with a clear message. */
const MAX_DOC_BYTES = 900_000;

const now = () => new Date().toISOString();
/** Document IDs can't contain a slash; every key we store is checked rather than escaped. */
function docId(id: string) {
  if (!id || id.includes('/') || id === '.' || id === '..')
    throw new Error(`Invalid document ID: ${id}`);
  return id;
}
const editId = (target: EditTarget, key: string, field: string) =>
  docId(`${target}~${key}~${field}`);

export function createStore(db: Firestore) {
  const trip = (tripId: string) => db.collection('trips').doc(docId(tripId));
  const sub = (tripId: string, name: string) => trip(tripId).collection(name);

  async function writeAll(refs: [DocumentReference, object | null][]) {
    for (let i = 0; i < refs.length; i += BATCH) {
      const batch = db.batch();
      for (const [ref, data] of refs.slice(i, i + BATCH))
        data ? batch.set(ref, data) : batch.delete(ref);
      await batch.commit();
    }
  }
  async function list<T>(tripId: string, name: string) {
    return (await sub(tripId, name).get()).docs.map((d) => d.data() as T);
  }

  return {
    async listTrips(): Promise<Trip[]> {
      const snap = await db.collection('trips').orderBy('startDate', 'desc').get();
      return snap.docs.map((d) => d.data() as Trip);
    },
    async getTrip(tripId: string): Promise<Trip | null> {
      return ((await trip(tripId).get()).data() as Trip | undefined) ?? null;
    },
    /** Creates the trip as a draft, or updates its details and keeps its status. */
    async putTrip(t: Omit<Trip, 'status' | 'createdAt' | 'updatedAt'>): Promise<Trip> {
      return db.runTransaction(async (tx) => {
        const existing = (await tx.get(trip(t.tripId))).data() as Trip | undefined;
        const next: Trip = {
          ...t,
          status: existing?.status ?? 'draft',
          createdAt: existing?.createdAt ?? now(),
          updatedAt: now(),
        };
        tx.set(trip(t.tripId), next);
        return next;
      });
    },
    async setTripStatus(tripId: string, status: TripStatus) {
      await trip(tripId).update({ status, updatedAt: now() });
    },
    /** Deletes the trip and everything under it. */
    async deleteTrip(tripId: string) {
      await db.recursiveDelete(trip(tripId));
    },

    async putPlan(tripId: string, plan: PlanSource) {
      const bytes = Buffer.byteLength(JSON.stringify(plan));
      if (bytes > MAX_DOC_BYTES)
        throw new Error(`The plan is too large to store in one document (${bytes} bytes)`);
      await sub(tripId, 'sources').doc('plan').set(plan);
    },
    async getPlan(tripId: string): Promise<PlanSource | null> {
      return (
        ((await sub(tripId, 'sources').doc('plan').get()).data() as PlanSource | undefined) ?? null
      );
    },

    /** Replaces the trip's Timeline slice: segments not in the new slice are removed. */
    async replaceTimeline(tripId: string, segments: TimelineSegment[]) {
      const col = sub(tripId, 'timelineSegments');
      const keep = new Set(segments.map((s) => docId(s.key)));
      const old = await col.select().get();
      await writeAll([
        ...old.docs
          .filter((d) => !keep.has(d.id))
          .map((d) => [d.ref, null] as [DocumentReference, null]),
        ...segments.map((s) => [col.doc(s.key), s] as [DocumentReference, object]),
      ]);
    },
    async listTimeline(tripId: string): Promise<TimelineSegment[]> {
      const segs = await list<TimelineSegment>(tripId, 'timelineSegments');
      return segs.sort((a, b) => a.startUtc.localeCompare(b.startUtc));
    },

    /** Adds or updates photos by media ID; photos already stored and not in the list are kept. */
    async upsertPhotos(tripId: string, photos: TripPhoto[]) {
      const col = sub(tripId, 'photos');
      await writeAll(photos.map((p) => [col.doc(docId(p.mediaId)), p]));
    },
    async listPhotos(tripId: string): Promise<TripPhoto[]> {
      const photos = await list<TripPhoto>(tripId, 'photos');
      return photos.sort((a, b) => a.takenUtc.localeCompare(b.takenUtc));
    },

    /** Sets one field's edit; a later edit of the same field replaces it. */
    async setEdit(tripId: string, edit: Omit<Edit, 'at'>) {
      const e: Edit = { ...edit, at: now() };
      await sub(tripId, 'edits')
        .doc(editId(e.target, e.key, e.field))
        .set(e);
    },
    async removeEdit(tripId: string, target: EditTarget, key: string, field: string) {
      await sub(tripId, 'edits')
        .doc(editId(target, key, field))
        .delete();
    },
    async listEdits(tripId: string): Promise<Edit[]> {
      return list<Edit>(tripId, 'edits');
    },

    /** Replaces the trip's journal; days no longer in it are removed. */
    async putJournal(tripId: string, j: Journal) {
      const col = sub(tripId, 'journal');
      const { days, ...meta } = j.trip;
      const dayIds = new Set(days.map((d) => `day-${d.date}`));
      const old = await col.select().get();
      await writeAll([
        ...old.docs
          .filter((d) => d.id.startsWith('day-') && !dayIds.has(d.id))
          .map((d) => [d.ref, null] as [DocumentReference, null]),
        ...days.map((d) => [col.doc(docId(`day-${d.date}`)), d] as [DocumentReference, object]),
        [col.doc('review'), { suggestions: j.suggestions, orphanEdits: j.orphanEdits }],
        // Written last: a reader that finds the meta finds every day it lists.
        [col.doc('meta'), { ...meta, dates: days.map((d) => d.date), builtAt: j.builtAt }],
      ]);
    },
    async getJournal(tripId: string): Promise<Journal | null> {
      const snap = await sub(tripId, 'journal').get();
      const docs = new Map(snap.docs.map((d) => [d.id, d.data()]));
      const meta = docs.get('meta');
      if (!meta) return null;
      const { dates, builtAt, ...trip } = meta as Journal['trip'] & {
        dates: string[];
        builtAt: string;
      };
      const review = (docs.get('review') ?? {}) as Partial<Journal>;
      return {
        trip: {
          ...trip,
          days: dates.map((d) => docs.get(`day-${d}`) as Journal['trip']['days'][number]),
        },
        suggestions: review.suggestions ?? [],
        orphanEdits: review.orphanEdits ?? [],
        builtAt,
      };
    },

    async recordImport(
      tripId: string,
      rec: Omit<ImportRecord, 'id' | 'at'>,
    ): Promise<ImportRecord> {
      const ref = sub(tripId, 'imports').doc();
      const r: ImportRecord = { ...rec, id: ref.id, at: now() };
      await ref.set(r);
      return r;
    },
    async setImportState(tripId: string, id: string, state: ImportRecord['state']) {
      await sub(tripId, 'imports').doc(docId(id)).update({ state });
    },
    async listImports(tripId: string): Promise<ImportRecord[]> {
      const snap = await sub(tripId, 'imports').orderBy('at', 'desc').get();
      return snap.docs.map((d) => d.data() as ImportRecord);
    },
  };
}

export type Store = ReturnType<typeof createStore>;

let store: Store | undefined;
/**
 * The app's store. Against the emulators when FIRESTORE_EMULATOR_HOST is set (development, tests,
 * CI), with the emulator-only demo project; otherwise against the real project, with the
 * credentials the host provides.
 */
export function getStore(): Store {
  if (store) return store;
  const emulated = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  const app =
    getApps()[0] ??
    initializeApp(
      emulated
        ? { projectId: process.env.FIREBASE_PROJECT_ID ?? 'demo-trip-summary' }
        : { credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID },
    );
  const db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  store = createStore(db);
  return store;
}
