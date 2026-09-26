import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { CORE_SCHEMA, PROTOTYPE_SCHEMA } from './schema.ts';

/** Shape of a trip data file (see data/README.md). Keys link rows within the file only. */
export type TripFile = {
  destination: {
    name: string;
    kind?: 'city' | 'region' | 'country';
    country?: string;
    timezone: string;
    lat?: number;
    lng?: number;
  };
  trip: { id: string; title: string; subtitle?: string; start_date: string; end_date: string };
  days?: { date: string; title?: string; tags?: string[] }[];
  places?: {
    key: string;
    title: string;
    lat?: number;
    lng?: number;
    category?: string;
    address?: string;
    maps_url?: string;
  }[];
  itinerary: {
    key: string;
    type: 'place' | 'lodging' | 'transit' | 'note';
    place?: string;
    title?: string;
    start_date: string;
    end_date?: string;
    start_time?: string;
    end_time?: string;
    from_location?: string;
    to_location?: string;
    departure_timezone?: string;
    arrival_timezone?: string;
    confirmation_code?: string;
    notes?: string;
  }[];
  photos?: {
    url: string;
    caption: string;
    date: string;
    time: string;
    entry?: string;
    lat?: number;
    lng?: number;
  }[];
};

export const DB_FILE = path.resolve(process.env.TRIP_DB || 'trip-sample.db');
export const DEFAULT_DATA_FILE = path.resolve('data/sample-trip.json');

export function openDb(file = DB_FILE) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(CORE_SCHEMA);
  db.exec(PROTOTYPE_SCHEMA);
  return db;
}

/** Loads a trip data file into the database and makes it the current trip. */
export function loadTrip(db: DatabaseSync, data: TripFile) {
  const v = <T>(x: T | undefined) => (x === undefined ? null : x);
  db.exec('BEGIN');
  try {
    const d = data.destination;
    db.prepare(
      'INSERT INTO destinations (name,kind,country,timezone,lat,lng) VALUES (?,?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET timezone=excluded.timezone',
    ).run(d.name, v(d.kind), v(d.country), d.timezone, v(d.lat), v(d.lng));
    const { destination_id } = db
      .prepare('SELECT destination_id FROM destinations WHERE name=?')
      .get(d.name) as { destination_id: number };

    const t = data.trip;
    db.prepare('UPDATE trips SET is_current=0 WHERE is_current=1').run();
    db.prepare(
      "INSERT INTO trips (trip_id,title,destination_id,start_date,end_date,status,is_current,notes) VALUES (?,?,?,?,?,'draft',1,?)",
    ).run(t.id, t.title, destination_id, t.start_date, t.end_date, v(t.subtitle));

    const placeIds = new Map<string, number>();
    const insertPlace = db.prepare(
      'INSERT INTO places (destination_id,title,address,maps_url,lat,lng,category) VALUES (?,?,?,?,?,?,?)',
    );
    for (const p of data.places ?? []) {
      const r = insertPlace.run(
        destination_id,
        p.title,
        v(p.address),
        v(p.maps_url),
        v(p.lat),
        v(p.lng),
        v(p.category),
      );
      placeIds.set(p.key, Number(r.lastInsertRowid));
    }

    const entryIds = new Map<string, number>();
    const insertItem = db.prepare(
      'INSERT INTO itinerary (trip_id,place_id,item_type,title,start_date,end_date,start_time,end_time,departure_timezone,arrival_timezone,from_location,to_location,confirmation_code,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    );
    for (const i of data.itinerary) {
      if (i.place && !placeIds.has(i.place))
        throw new Error(`itinerary "${i.key}" references unknown place "${i.place}"`);
      const r = insertItem.run(
        t.id,
        i.place ? placeIds.get(i.place)! : null,
        i.type,
        v(i.title),
        i.start_date,
        v(i.end_date),
        v(i.start_time),
        v(i.end_time),
        v(i.departure_timezone),
        v(i.arrival_timezone),
        v(i.from_location),
        v(i.to_location),
        v(i.confirmation_code),
        v(i.notes),
      );
      entryIds.set(i.key, Number(r.lastInsertRowid));
    }

    // Day titles live in the prototype `days` table; day tags use the core itinerary 'tag' item type.
    const insertDay = db.prepare('INSERT INTO days (trip_id,date,title) VALUES (?,?,?)');
    const insertTag = db.prepare(
      "INSERT INTO itinerary (trip_id,item_type,title,start_date) VALUES (?,'tag',?,?)",
    );
    for (const day of data.days ?? []) {
      insertDay.run(t.id, day.date, v(day.title));
      for (const tag of day.tags ?? []) insertTag.run(t.id, tag, day.date);
    }

    const insertPhoto = db.prepare(
      'INSERT INTO photos (trip_id,entry_id,date,time,url,caption,latitude,longitude) VALUES (?,?,?,?,?,?,?,?)',
    );
    for (const p of data.photos ?? []) {
      if (p.entry && !entryIds.has(p.entry))
        throw new Error(`photo "${p.url}" references unknown entry "${p.entry}"`);
      insertPhoto.run(
        t.id,
        p.entry ? entryIds.get(p.entry)! : null,
        p.date,
        p.time,
        p.url,
        p.caption,
        v(p.lat),
        v(p.lng),
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Replaces the database with a fresh one containing only the given data file. */
export function seed(dataFile = DEFAULT_DATA_FILE, dbFile = DB_FILE) {
  for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) rmSync(f, { force: true });
  const db = openDb(dbFile);
  loadTrip(db, JSON.parse(readFileSync(dataFile, 'utf8')) as TripFile);
  return db;
}

/** Opens the database, seeding the default sample on first run so `npm run dev` works out of the box. */
export function getDb() {
  if (!existsSync(DB_FILE)) return seed();
  return openDb();
}
