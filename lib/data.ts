import { getDb } from './db.ts';

export type Photo = {
  id: string;
  url: string;
  caption: string;
  lat: number | null;
  lng: number | null;
  date: string;
  time: string;
};
export type Entry = {
  id: string;
  day: string;
  type: 'place' | 'lodging' | 'transit' | 'note' | 'photo' | 'cluster';
  title: string;
  time: string;
  end_time: string | null;
  notes: string;
  lat: number | null;
  lng: number | null;
  tags: string[];
  maps_url: string | null;
  photos: Photo[];
  check_out: string | null;
  from_location: string | null;
  to_location: string | null;
  departure_timezone: string | null;
  arrival_timezone: string | null;
  /** Set when a place/note runs across several days: its final day, end time and lane. */
  span_end: { date: string; time: string | null; lane: number } | null;
};
/** A multi-day entry seen from a later day of its span. */
export type SpanDay = {
  id: string;
  title: string;
  dayNumber: number;
  final: boolean;
  lane: number;
};
export type Day = {
  date: string;
  title: string;
  tags: string[];
  entries: Entry[];
  /** Multi-day entries that started on an earlier day and continue through this one. */
  continuing: SpanDay[];
  /** Multi-day entries that end on this day, with their end time. */
  /** `outer` is the outermost lane still drawn at that moment, so the END label can clear it. */
  spanEnds: { id: string; time: string | null; lane: number; outer: number }[];
};
export type Trip = {
  title: string;
  subtitle: string;
  timezone: string;
  destination: { name: string; lat: number | null; lng: number | null };
  days: Day[];
};

type ItemRow = {
  entry_id: number;
  item_type: 'place' | 'lodging' | 'transit' | 'note' | 'tag';
  title: string | null;
  place_title: string | null;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  maps_url: string | null;
  category: string | null;
  from_location: string | null;
  to_location: string | null;
  departure_timezone: string | null;
  arrival_timezone: string | null;
};
type PhotoRow = Omit<Photo, 'id'> & { photo_id: number; entry_id: number | null };

/** Most multi-day lanes drawn side by side (user decision). */
const MAX_LANES = 3;
const DAY_MS = 86_400_000;
const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

function dateRange(start: string, end: string) {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function getTrip(): Trip {
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
    .all(trip.trip_id) as ItemRow[];
  const photoRows = db
    .prepare(
      `SELECT photo_id, entry_id, date, time, url, caption, latitude AS lat, longitude AS lng
       FROM photos WHERE trip_id=? ORDER BY date, time, photo_id`,
    )
    .all(trip.trip_id) as PhotoRow[];
  const dayRows = db.prepare('SELECT date, title FROM days WHERE trip_id=?').all(trip.trip_id) as {
    date: string;
    title: string | null;
  }[];

  const toPhoto = ({ photo_id, entry_id: _entry, ...p }: PhotoRow): Photo => ({
    ...p,
    id: String(photo_id),
  });
  const entryPhotos = (id: number) => photoRows.filter((p) => p.entry_id === id).map(toPhoto);

  const events = items.filter((i) => i.item_type !== 'tag');
  const tags = items.filter((i) => i.item_type === 'tag');
  const titles = new Map(dayRows.map((d) => [d.date, d.title ?? '']));
  const allDates = [
    ...events.map((i) => i.start_date),
    ...photoRows.map((p) => p.date),
    ...dayRows.map((d) => d.date),
  ].sort();
  const first = trip.start_date ?? allDates[0];
  const last = trip.end_date ?? allDates[allDates.length - 1];
  if (!first || !last) throw new Error('The current trip has no dates.');

  // Places and notes that end on a later day are drawn as a multi-day span; lodging uses check-out instead.
  const isSpan = (i: ItemRow) =>
    i.item_type !== 'lodging' && !!i.end_date && i.end_date > i.start_date;
  const spans = events.filter(isSpan);
  // Overlapping spans get side-by-side lanes: each takes the lowest lane whose previous span has
  // ended by the time it starts. At most MAX_LANES run at once; a span that finds no free lane
  // gets lane -1 and is shown without a line (start entry, day labels and end marker only).
  const laneOf = new Map<number, number>();
  const laneEnds: string[] = [];
  const at = (date: string, time: string | null, fallback: string) => `${date} ${time ?? fallback}`;
  for (const sp of [...spans].sort((a, b) =>
    at(a.start_date, a.start_time, '00:00').localeCompare(at(b.start_date, b.start_time, '00:00')),
  )) {
    const start = at(sp.start_date, sp.start_time, '00:00');
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane === -1 && laneEnds.length < MAX_LANES) lane = laneEnds.push('') - 1;
    if (lane !== -1) laneEnds[lane] = at(sp.end_date!, sp.end_time, '23:59');
    laneOf.set(sp.entry_id, lane);
  }

  const days: Day[] = dateRange(first, last).map((date) => {
    const entries: Entry[] = events
      .filter((i) => i.start_date === date)
      .map((i) => ({
        id: `i${i.entry_id}`,
        day: date,
        type: i.item_type as Entry['type'],
        title: i.title ?? i.place_title ?? '',
        time: i.start_time ?? '',
        end_time: i.item_type === 'lodging' ? null : i.end_time,
        notes: i.notes ?? '',
        lat: i.lat,
        lng: i.lng,
        maps_url: i.maps_url,
        tags:
          i.item_type === 'lodging'
            ? ['Stay']
            : i.item_type === 'place' && i.category
              ? [i.category]
              : [],
        photos: entryPhotos(i.entry_id),
        check_out:
          i.item_type === 'lodging' && i.end_date
            ? [i.end_date, i.end_time].filter(Boolean).join(' · ')
            : null,
        from_location: i.from_location,
        to_location: i.to_location,
        departure_timezone: i.departure_timezone,
        arrival_timezone: i.arrival_timezone,
        span_end: isSpan(i)
          ? { date: i.end_date!, time: i.end_time, lane: laneOf.get(i.entry_id) ?? 0 }
          : null,
      }));

    // Photos not attached to an entry: a lone photo in an hour is a moment, several are a cluster.
    const free = photoRows.filter((p) => p.date === date && p.entry_id === null);
    const byHour = new Map<string, PhotoRow[]>();
    for (const p of free)
      byHour.set(p.time.slice(0, 2), [...(byHour.get(p.time.slice(0, 2)) ?? []), p]);
    for (const group of byHour.values()) {
      const head = group[0];
      const single = group.length === 1;
      entries.push({
        id: `${single ? 'p' : 'c'}${head.photo_id}`,
        day: date,
        type: single ? 'photo' : 'cluster',
        title: single ? 'A moment on the journey' : `${group.length} photos`,
        time: head.time,
        end_time: single ? null : group[group.length - 1].time,
        notes: '',
        lat: head.lat,
        lng: head.lng,
        maps_url: null,
        tags: [],
        photos: group.map(toPhoto),
        check_out: null,
        from_location: null,
        to_location: null,
        departure_timezone: null,
        arrival_timezone: null,
        span_end: null,
      });
    }
    entries.sort((a, b) => a.time.localeCompare(b.time));

    return {
      date,
      title: titles.get(date) ?? '',
      tags: tags.filter((t) => t.start_date === date).map((t) => t.title ?? ''),
      entries,
      continuing: spans
        .filter((s) => s.start_date < date && date <= s.end_date!)
        .map((s) => ({
          id: `i${s.entry_id}`,
          title: s.title ?? s.place_title ?? '',
          dayNumber: daysBetween(s.start_date, date) + 1,
          final: date === s.end_date,
          lane: laneOf.get(s.entry_id) ?? 0,
        })),
      spanEnds: spans
        .filter((s) => s.end_date === date)
        .map((s) => {
          const t = at(s.end_date!, s.end_time, '23:59');
          const running = spans.filter(
            (o) =>
              (laneOf.get(o.entry_id) ?? -1) >= 0 &&
              at(o.start_date, o.start_time, '00:00') <= t &&
              t <= at(o.end_date!, o.end_time, '23:59'),
          );
          return {
            id: `i${s.entry_id}`,
            time: s.end_time,
            lane: laneOf.get(s.entry_id) ?? -1,
            outer: Math.max(-1, ...running.map((o) => laneOf.get(o.entry_id) ?? -1)),
          };
        }),
    };
  });

  return {
    title: trip.title ?? '',
    subtitle: trip.subtitle ?? '',
    timezone: trip.timezone,
    destination: { name: trip.destination, lat: trip.lat, lng: trip.lng },
    days,
  };
}
