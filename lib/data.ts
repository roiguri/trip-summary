import { getDb } from './db.ts';
import { buildTrip, type ModelItem, type ModelPhoto } from './model.ts';

export type * from './model.ts';

// The sample fixture: reads the trip seeded from data/sample-trip.json (lib/db.ts) and draws it as the
// prototype did, loose photos grouped by clock hour. Real trips come from the merge (lib/merge/).

export function getTrip() {
  const db = getDb();
  const trip = db
    .prepare(
      `SELECT t.trip_id, t.title, t.notes AS subtitle, t.start_date, t.end_date,
              d.name AS destination, d.timezone, d.lat, d.lng
       FROM trips t JOIN destinations d USING(destination_id) WHERE t.is_current=1`,
    )
    .get() as
    | {
        trip_id: string;
        title: string | null;
        subtitle: string | null;
        start_date: string | null;
        end_date: string | null;
        destination: string;
        timezone: string;
        lat: number | null;
        lng: number | null;
      }
    | undefined;
  if (!trip) throw new Error('No current trip in the database. Run `npm run seed`.');

  const items = db
    .prepare(
      `SELECT i.*, p.title AS place_title, p.lat, p.lng, p.maps_url, p.category
       FROM itinerary i LEFT JOIN places p ON i.place_id=p.place_id
       WHERE i.trip_id=? ORDER BY i.start_date, i.start_time, i.entry_id`,
    )
    .all(trip.trip_id) as ModelItem[];
  const photoRows = db
    .prepare(
      `SELECT photo_id, entry_id, date, time, url, caption, latitude AS lat, longitude AS lng
       FROM photos WHERE trip_id=? ORDER BY date, time, photo_id`,
    )
    .all(trip.trip_id) as ModelPhoto[];
  const dayRows = db.prepare('SELECT date, title FROM days WHERE trip_id=?').all(trip.trip_id) as {
    date: string;
    title: string | null;
  }[];

  const byHour = new Map<string, ModelPhoto[]>();
  for (const p of photoRows.filter((p) => p.entry_id === null)) {
    const k = `${p.date} ${p.time.slice(0, 2)}`;
    byHour.set(k, [...(byHour.get(k) ?? []), p]);
  }
  return buildTrip({
    trip,
    items,
    photos: photoRows,
    looseGroups: [...byHour.values()],
    dayTitles: new Map(dayRows.map((d) => [d.date, d.title ?? ''])),
  });
}
