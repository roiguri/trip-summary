// Reads one trip's plan from a Jarvis travel database (docs/DATA-DESIGN.md, "Sources": the plan is
// the skeleton) and stores it. The database file is opened read-only: the importer can never change
// the owner's Jarvis data.
import { DatabaseSync } from 'node:sqlite';
import type { JarvisRow, PlanSource, Store } from '../store/index.ts';
import { rebuildJournal } from '../journal.ts';

/** The tables and columns the importer reads; anything else in the file is ignored. */
const REQUIRED: Record<string, string[]> = {
  destinations: ['destination_id', 'name', 'timezone'],
  trips: ['trip_id', 'title', 'destination_id', 'start_date', 'end_date'],
  places: ['place_id', 'google_place_id', 'title', 'lat', 'lng'],
  itinerary: ['entry_id', 'trip_id', 'place_id', 'item_type', 'start_date'],
};

export class PlanImportError extends Error {}

export type JarvisTripSummary = {
  tripId: string;
  title: string | null;
  destination: string;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  entries: number;
};

function open(file: string) {
  const db = new DatabaseSync(file, { readOnly: true });
  for (const [table, columns] of Object.entries(REQUIRED)) {
    const have = new Set(
      (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((c) => c.name),
    );
    if (!have.size) throw new PlanImportError(`Not a Jarvis travel database: no "${table}" table`);
    const missing = columns.filter((c) => !have.has(c));
    if (missing.length)
      throw new PlanImportError(
        `The "${table}" table is missing ${missing.map((c) => `"${c}"`).join(', ')}`,
      );
  }
  return db;
}

/** The trips in a Jarvis database, current first, for choosing which one to import. */
export function listJarvisTrips(file: string): JarvisTripSummary[] {
  const db = open(file);
  try {
    return (
      db
        .prepare(
          `SELECT t.trip_id, t.title, d.name AS destination, t.start_date, t.end_date, t.is_current,
                  (SELECT count(*) FROM itinerary i WHERE i.trip_id = t.trip_id) AS entries
           FROM trips t JOIN destinations d USING (destination_id)
           ORDER BY t.is_current DESC, COALESCE(t.start_date, '9999') DESC, t.trip_id`,
        )
        .all() as JarvisRow[]
    ).map((r) => ({
      tripId: String(r.trip_id),
      title: (r.title as string | null) ?? null,
      destination: String(r.destination),
      startDate: (r.start_date as string | null) ?? null,
      endDate: (r.end_date as string | null) ?? null,
      isCurrent: r.is_current === 1,
      entries: Number(r.entries),
    }));
  } finally {
    db.close();
  }
}

/** One trip's rows: the trip, its destination, its itinerary and only the places it references. */
export function readJarvisPlan(file: string, tripId: string): Omit<PlanSource, 'importedAt'> {
  const db = open(file);
  try {
    const trip = db.prepare('SELECT * FROM trips WHERE trip_id = ?').get(tripId) as
      JarvisRow | undefined;
    if (!trip) {
      const ids = (db.prepare('SELECT trip_id FROM trips').all() as JarvisRow[]).map(
        (r) => r.trip_id,
      );
      throw new PlanImportError(
        `No trip "${tripId}" in this database (it has: ${ids.join(', ') || 'none'})`,
      );
    }
    const destination = db
      .prepare('SELECT * FROM destinations WHERE destination_id = ?')
      .get(trip.destination_id) as JarvisRow;
    const itinerary = db
      .prepare(
        'SELECT * FROM itinerary WHERE trip_id = ? ORDER BY start_date, start_time, entry_id',
      )
      .all(tripId) as JarvisRow[];
    const places = db
      .prepare(
        'SELECT * FROM places WHERE place_id IN (SELECT place_id FROM itinerary WHERE trip_id = ?) ORDER BY place_id',
      )
      .all(tripId) as JarvisRow[];
    // Rows come back with a null prototype; plain copies store and compare as ordinary objects.
    const plain = (r: JarvisRow) => ({ ...r });
    return {
      destination: plain(destination),
      trip: plain(trip),
      places: places.map(plain),
      itinerary: itinerary.map(plain),
    };
  } finally {
    db.close();
  }
}

/** What a re-import changes in the itinerary, by Jarvis entry ID. */
export function diffItinerary(before: JarvisRow[], after: JarvisRow[]) {
  // Compared on content: column order doesn't matter, and `created_at` is Jarvis's bookkeeping.
  const text = (r: JarvisRow) =>
    JSON.stringify(
      Object.keys(r)
        .filter((k) => k !== 'created_at')
        .sort()
        .map((k) => [k, r[k]]),
    );
  const old = new Map(before.map((r) => [r.entry_id, text(r)]));
  const seen = new Set(after.map((r) => r.entry_id));
  let added = 0;
  let changed = 0;
  for (const r of after) {
    if (!old.has(r.entry_id)) added++;
    else if (old.get(r.entry_id) !== text(r)) changed++;
  }
  const removed = before.filter((r) => !seen.has(r.entry_id)).length;
  return { added, changed, removed, unchanged: after.length - added - changed };
}

/** Imports one trip's plan into the store, creating the trip as a draft the first time. */
export async function importPlan(store: Store, file: string, tripId: string, by: string) {
  const rows = readJarvisPlan(file, tripId);
  // A published trip only changes through the import review (docs/DATA-DESIGN.md, "Import and
  // publishing"), which isn't built yet: refuse rather than change what viewers see.
  if ((await store.getTrip(tripId))?.status === 'published')
    throw new PlanImportError(`"${tripId}" is published: re-importing it needs the import review`);
  const previous = await store.getPlan(tripId);
  const d = rows.destination;
  const t = rows.trip;
  const trip = await store.putTrip({
    tripId,
    title: String(t.title ?? d.name),
    destinationName: String(d.name),
    timezone: String(d.timezone),
    startDate: (t.start_date as string | null) ?? null,
    endDate: (t.end_date as string | null) ?? null,
  });
  await store.putPlan(tripId, { ...rows, importedAt: new Date().toISOString() });
  const summary = diffItinerary(previous?.itinerary ?? [], rows.itinerary);
  const record = await store.recordImport(tripId, {
    source: 'plan',
    by,
    summary,
    state: 'applied',
  });
  await rebuildJournal(store, tripId);
  return { trip, summary, record };
}
