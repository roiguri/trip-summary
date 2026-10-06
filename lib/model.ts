// The model the page draws (app/), built from a trip's entries and photos. Pure: the merge
// (lib/merge/) and the sample fixture (lib/data.ts) both feed it, so the drawing has one source.

export type Photo = {
  id: string;
  url: string;
  caption: string;
  lat: number | null;
  lng: number | null;
  date: string;
  time: string;
  /** One of the owner's favourite photos (DESIGN.md, "Edit mode, round 2", PH1). */
  highlighted?: true;
  /** A small version (about 400px) for cards and grids; `url` is the full one, for the viewer. */
  thumb?: string;
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
  /** Lodging: the check-in entry, or the check-out entry generated on the last day of the stay. */
  stay: { role: 'checkin' | 'checkout'; stayId: string } | null;
  /** Transit: how the leg was travelled (drives the icon). */
  mode: TransitMode | null;
  /** Marked by the owner as a high point; absent otherwise, so unedited trips are unchanged. */
  highlighted?: true;
  /** Transit: the outermost multi-day lane running when the leg starts (-1 if none), so its text can
   *  sit close to the rail but clear of the lanes. */
  outer?: number;
  /** The block it belongs to (DESIGN.md, "Blocks"); absent otherwise. */
  block?: string;
};

/** A group of entries forming one larger event (a bike ride, a trek), made by the owner: from its
 *  first attached entry to its last, everything between included (DESIGN.md, "Blocks"). */
export type Block = {
  id: string;
  title: string;
  emoji: string;
  color: string;
  note: string;
  /** The days it covers, in order. */
  days: string[];
  start: { date: string; time: string };
  end: { date: string; time: string };
  stops: number;
  photos: number;
  /** Shown folded by default: a contact sheet of its photos and its stops (the owner's choice). */
  collapsed?: true;
  /** The photos the owner chose for its contact sheet, in order (media IDs). */
  shown?: string[];
};
export type TransitMode = 'car' | 'train' | 'flight' | 'bus' | 'ferry' | 'walk' | 'bike';

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
  /** Stays slept in on the night after this day (shown as an end-of-day marker). `outer` is the
   *  outermost multi-day lane still drawn at the end of the day, so the marker can clear it. */
  nights: { stayId: string; title: string; outer: number }[];
};
export type Trip = {
  title: string;
  subtitle: string;
  timezone: string;
  destination: { name: string; lat: number | null; lng: number | null };
  days: Day[];
  /** The owner's blocks; absent when there are none, so unedited trips are unchanged. */
  blocks?: Block[];
};

/** How a leg was travelled, guessed from its title when no Timeline activity says (anything
 *  unrecognised is a car). */

/** A leg's travel mode as drawn: its own, else read from its title. */
export const legMode = (i: Pick<ModelItem, 'mode' | 'title' | 'place_title'>): TransitMode =>
  i.mode ?? transitModeFromTitle(i.title ?? i.place_title ?? '');

export function transitModeFromTitle(title: string): TransitMode {
  if (/\b(train|rail|shinkansen|metro|subway|tram)/i.test(title)) return 'train';
  if (/\b(flight|fly|plane|airport)/i.test(title)) return 'flight';
  if (/\b(bus|shuttle|coach)/i.test(title)) return 'bus';
  if (/\b(ferry|boat|ship|cruise)/i.test(title)) return 'ferry';
  if (/\b(bike|cycl)/i.test(title)) return 'bike';
  if (/\b(walk|on foot)/i.test(title)) return 'walk';
  return 'car';
}

/** One itinerary entry as the model needs it: a Jarvis itinerary row joined with its place. */
export type ModelItem = {
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
  /** Set when the owner chose how a leg was travelled; otherwise guessed from the title. */
  mode?: TransitMode | null;
  /** The owner marked it as a high point of the trip (DESIGN.md, "Highlight (H5)"). */
  highlighted?: boolean;
};
/** A photo with the entry it is attached to (null: loose) and its order key. `id` may be empty
 *  (the sample's rows), in which case the order key stands in. */
export type ModelPhoto = Omit<Photo, 'id'> & {
  id?: string;
  entry_id: number | null;
  photo_id: number;
};

export type ModelInput = {
  trip: {
    title: string | null;
    subtitle: string | null;
    start_date: string | null;
    end_date: string | null;
    destination: string;
    timezone: string;
    lat: number | null;
    lng: number | null;
  };
  items: ModelItem[];
  photos: ModelPhoto[];
  /** Loose photos grouped into moments (one photo) and clusters (several), in order. */
  looseGroups: ModelPhoto[][];
  dayTitles: Map<string, string>;
};

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

export function buildTrip({
  trip,
  items,
  photos: photoRows,
  looseGroups,
  dayTitles,
}: ModelInput): Trip {
  // A photo keeps its own ID (a Google media ID) when it has one; the sample's rows have none.
  const toPhoto = ({ photo_id, entry_id: _entry, ...p }: ModelPhoto): Photo => ({
    ...p,
    id: p.id || String(photo_id),
  });
  const entryPhotos = (id: number) => photoRows.filter((p) => p.entry_id === id).map(toPhoto);

  const events = items.filter((i) => i.item_type !== 'tag');
  const tags = items.filter((i) => i.item_type === 'tag');
  const titles = dayTitles;
  const allDates = [
    ...events.map((i) => i.start_date),
    ...photoRows.map((p) => p.date),
    ...dayTitles.keys(),
  ].sort();
  const first = trip.start_date ?? allDates[0];
  const last = trip.end_date ?? allDates[allDates.length - 1];
  if (!first || !last) throw new Error('The current trip has no dates.');

  // Places and notes that end on a later day are drawn as a multi-day span; lodging uses check-out instead.
  const isSpan = (i: ModelItem) =>
    i.item_type !== 'lodging' && !!i.end_date && i.end_date > i.start_date;
  const spans = events.filter(isSpan);
  // Stays (lodging with a later check-out date): check-in entry, an end-of-day marker for each
  // night, and a check-out entry on the last day (user decision, following the locked mock).
  const stays = events.filter(
    (i) => i.item_type === 'lodging' && !!i.end_date && i.end_date > i.start_date,
  );
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
        stay: i.item_type === 'lodging' ? { role: 'checkin', stayId: `i${i.entry_id}` } : null,
        ...(i.highlighted ? { highlighted: true as const } : {}),
        mode: i.item_type === 'transit' ? legMode(i) : null,
      }));

    // A stay also appears on its last day as a check-out entry at the check-out time.
    for (const s of stays.filter((s) => s.end_date === date && s.end_date > s.start_date))
      entries.push({
        id: `i${s.entry_id}-out`,
        day: date,
        type: 'lodging',
        title: s.title ?? s.place_title ?? '',
        time: s.end_time ?? '',
        end_time: null,
        notes: '',
        lat: s.lat,
        lng: s.lng,
        maps_url: s.maps_url,
        tags: ['Stay'],
        photos: [],
        check_out: null,
        from_location: null,
        to_location: null,
        departure_timezone: null,
        arrival_timezone: null,
        span_end: null,
        stay: { role: 'checkout', stayId: `i${s.entry_id}` },
        mode: null,
      });

    // Loose photos, already grouped: a lone photo is a moment, several are a cluster.
    for (const group of looseGroups.filter((g) => g[0].date === date)) {
      const head = group[0];
      const single = group.length === 1;
      entries.push({
        id: `${single ? 'p' : 'c'}${head.photo_id}`,
        day: date,
        type: single ? 'photo' : 'cluster',
        // A loose photo is titled by its caption; without one it has no title, only its time (user decision).
        title: single ? head.caption : `${group.length} photos`,
        time: head.time,
        // A cluster shows a time range only when its photos span more than one minute.
        end_time:
          single || group[group.length - 1].time === head.time
            ? null
            : group[group.length - 1].time,
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
        stay: null,
        mode: null,
      });
    }
    entries.sort((a, b) => a.time.localeCompare(b.time));
    for (const e of entries)
      if (e.type === 'transit') {
        const t = `${date} ${e.time || '00:00'}`;
        e.outer = Math.max(
          -1,
          ...spans
            .filter(
              (o) =>
                (laneOf.get(o.entry_id) ?? -1) >= 0 &&
                at(o.start_date, o.start_time, '00:00') <= t &&
                t <= at(o.end_date!, o.end_time, '23:59'),
            )
            .map((o) => laneOf.get(o.entry_id) ?? -1),
        );
      }
    const endOfDay = `${date} 23:59`;
    const lanesAtEndOfDay = spans.filter(
      (o) =>
        (laneOf.get(o.entry_id) ?? -1) >= 0 &&
        at(o.start_date, o.start_time, '00:00') <= endOfDay &&
        endOfDay <= at(o.end_date!, o.end_time, '23:59'),
    );

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
      nights: stays
        .filter((s) => s.start_date <= date && date < s.end_date!)
        .map((s) => ({
          stayId: `i${s.entry_id}`,
          title: s.title ?? s.place_title ?? '',
          outer: Math.max(-1, ...lanesAtEndOfDay.map((o) => laneOf.get(o.entry_id) ?? -1)),
        })),
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
