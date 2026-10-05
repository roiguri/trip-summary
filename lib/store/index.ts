// Every read and write of the app's data goes through here (docs/ARCHITECTURE.md, "Rules that keep it
// portable"): moving off Firebase means rewriting this module, not the app.
import { adminApp } from '../firebase-admin.ts';
import { getFirestore, type Firestore, type DocumentReference } from 'firebase-admin/firestore';
import type {
  Edit,
  EditTarget,
  ImportRecord,
  Journal,
  Pending,
  PickedRecord,
  Person,
  PlanSource,
  Trip,
  TripPhoto,
  TripStatus,
  TripSummary,
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
    /** Cached place names by Google place ID (null: Google has none). Not trip data: shared. */
    async getPlaceNames(ids: string[]): Promise<Map<string, string | null>> {
      const out = new Map<string, string | null>();
      for (let i = 0; i < ids.length; i += 100) {
        const refs = ids.slice(i, i + 100).map((id) => db.collection('placeNames').doc(docId(id)));
        if (!refs.length) continue;
        const snaps = await db.getAll(...refs);
        snaps.forEach((s, n) => {
          if (s.exists) out.set(ids[i + n], (s.data()!.name as string | null) ?? null);
        });
      }
      return out;
    },
    async putPlaceNames(names: Map<string, string | null>) {
      const at = now();
      await writeAll(
        [...names].map(
          ([id, name]) =>
            [db.collection('placeNames').doc(docId(id)), { name, at }] as [
              DocumentReference,
              object,
            ],
        ),
      );
    },
    async getTrip(tripId: string): Promise<Trip | null> {
      return ((await trip(tripId).get()).data() as Trip | undefined) ?? null;
    },
    /** Creates the trip as a draft, or updates its details and keeps its status. */
    async putTrip(t: Omit<Trip, 'status' | 'createdAt' | 'updatedAt' | 'summary'>): Promise<Trip> {
      return db.runTransaction(async (tx) => {
        const existing = (await tx.get(trip(t.tripId))).data() as Trip | undefined;
        const next: Trip = {
          ...t,
          ...(existing?.summary ? { summary: existing.summary } : {}),
          status: existing?.status ?? 'draft',
          createdAt: existing?.createdAt ?? now(),
          updatedAt: now(),
        };
        tx.set(trip(t.tripId), next);
        return next;
      });
    },
    async setTripSummary(tripId: string, summary: TripSummary) {
      await trip(tripId).update({ summary });
    },
    async setTripStatus(tripId: string, status: TripStatus) {
      await trip(tripId).update({ status, updatedAt: now() });
    },
    /** Deletes the trip and everything under it. */
    async deleteTrip(tripId: string) {
      await db.recursiveDelete(trip(tripId));
      const people = await db.collection('people').where('tripId', '==', tripId).get();
      await writeAll(people.docs.map((d) => [d.ref, null] as [DocumentReference, null]));
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

    /** Stores an import for review, replacing the one of the same source already waiting. */
    async putPending(tripId: string, p: Pending) {
      const bytes = Buffer.byteLength(JSON.stringify(p));
      if (bytes > MAX_DOC_BYTES)
        throw new Error(`This import is too large to review in one go (${bytes} bytes)`);
      await sub(tripId, 'sources').doc(`pending-${p.source}`).set(p);
    },
    async getPending<S extends Pending['source']>(
      tripId: string,
      source: S,
    ): Promise<Extract<Pending, { source: S }> | null> {
      const doc = await sub(tripId, 'sources').doc(`pending-${source}`).get();
      return (doc.data() as Extract<Pending, { source: S }> | undefined) ?? null;
    },
    async listPending(tripId: string): Promise<Pending[]> {
      const docs = await Promise.all(
        ['plan', 'timeline', 'photos'].map((src) =>
          sub(tripId, 'sources').doc(`pending-${src}`).get(),
        ),
      );
      return docs.flatMap((d) => (d.exists ? [d.data() as Pending] : []));
    },

    async updatePending(
      tripId: string,
      source: Pending['source'],
      changes: Record<string, number | string>,
    ) {
      await sub(tripId, 'sources').doc(`pending-${source}`).update(changes);
    },
    async deletePending(tripId: string, source: Pending['source']) {
      await sub(tripId, 'sources').doc(`pending-${source}`).delete();
      if (source === 'photos') {
        await db.recursiveDelete(sub(tripId, 'pickedItems'));
        await db.recursiveDelete(sub(tripId, 'pendingPhotos'));
      }
    },
    async putPickedItems(tripId: string, records: PickedRecord[]) {
      const col = sub(tripId, 'pickedItems');
      await writeAll(
        records.map((r) => [col.doc(docId(r.mediaId)), r] as [DocumentReference, object]),
      );
    },
    /** The next picked items still to copy. */
    async nextPicked(tripId: string, n: number): Promise<PickedRecord[]> {
      const snap = await sub(tripId, 'pickedItems').where('done', '==', false).limit(n).get();
      return snap.docs.map((d) => d.data() as PickedRecord);
    },
    /** Marks picked items as copied; `failed` ones are marked too, so a broken item can't stall the
     *  job, and counted. */
    async markPicked(tripId: string, done: string[], failed: string[] = []) {
      const col = sub(tripId, 'pickedItems');
      const batch = db.batch();
      for (const id of done) batch.update(col.doc(docId(id)), { done: true });
      for (const id of failed) batch.update(col.doc(docId(id)), { done: true, failed: true });
      await batch.commit();
    },
    /** Where the picked items stand, counted from their records: overlapping copy requests (a page
     *  reloaded mid-request) can't lose an update the way a stored counter can. */
    async countPicked(tripId: string) {
      const col = sub(tripId, 'pickedItems');
      const [waiting, failed, all] = await Promise.all([
        col.where('done', '==', false).count().get(),
        col.where('failed', '==', true).count().get(),
        col.count().get(),
      ]);
      const left = waiting.data().count;
      const bad = failed.data().count;
      return { done: all.data().count - left - bad, failed: bad, remaining: left };
    },
    async putPendingPhotos(tripId: string, photos: TripPhoto[]) {
      const col = sub(tripId, 'pendingPhotos');
      await writeAll(
        photos.map((p) => [col.doc(docId(p.mediaId)), p] as [DocumentReference, object]),
      );
    },
    async listPendingPhotos(tripId: string): Promise<TripPhoto[]> {
      return list<TripPhoto>(tripId, 'pendingPhotos');
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
        [
          col.doc('review'),
          {
            suggestions: j.suggestions,
            proposals: j.proposals,
            unvisited: j.unvisited,
            orphanEdits: j.orphanEdits,
          },
        ],
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
        proposals: review.proposals ?? [],
        unvisited: review.unvisited ?? [],
        orphanEdits: review.orphanEdits ?? [],
        builtAt,
      };
    },

    async putPerson(p: Person) {
      await db.collection('people').doc(docId(p.personId)).set(p);
    },
    async getPerson(personId: string): Promise<Person | null> {
      return (
        ((await db.collection('people').doc(docId(personId)).get()).data() as Person | undefined) ??
        null
      );
    },
    /** Updates some of a person's fields, but only while they match `expect`: a compare-and-set, so
     *  two browsers opening one invite at once can't both bind to it. Returns whether it applied. */
    async updatePerson(personId: string, changes: Partial<Person>, expect: Partial<Person> = {}) {
      const ref = db.collection('people').doc(docId(personId));
      return db.runTransaction(async (tx) => {
        const cur = (await tx.get(ref)).data() as Person | undefined;
        if (!cur) return false;
        for (const [k, v] of Object.entries(expect)) if (cur[k as keyof Person] !== v) return false;
        tx.update(ref, changes);
        return true;
      });
    },
    async findPersonByInvite(inviteHash: string): Promise<Person | null> {
      const snap = await db
        .collection('people')
        .where('inviteHash', '==', inviteHash)
        .limit(1)
        .get();
      return (snap.docs[0]?.data() as Person | undefined) ?? null;
    },
    async listPeople(tripId: string): Promise<Person[]> {
      const snap = await db.collection('people').where('tripId', '==', tripId).get();
      return snap.docs.map((d) => d.data() as Person);
    },
    /** Everyone-on-a-trip records for a signed-in account, by its UID and by its email. */
    async peopleFor(uid: string, email: string | null): Promise<Person[]> {
      const col = db.collection('people');
      const [byUid, byEmail] = await Promise.all([
        col.where('uid', '==', uid).get(),
        email ? col.where('email', '==', email).get() : Promise.resolve(null),
      ]);
      const all = [...byUid.docs, ...(byEmail?.docs ?? [])].map((d) => d.data() as Person);
      return [...new Map(all.map((p) => [p.personId, p])).values()];
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

/** The app's store (see lib/firebase-admin.ts for which Firebase it reaches). Cached on the process,
 *  not the module: Next bundles each route separately, and Firestore's settings may be set once. */
export function getStore(): Store {
  const g = globalThis as { __tripSummaryStore?: Store };
  if (!g.__tripSummaryStore) {
    const db = getFirestore(adminApp());
    db.settings({ ignoreUndefinedProperties: true });
    g.__tripSummaryStore = createStore(db);
  }
  return g.__tripSummaryStore;
}
