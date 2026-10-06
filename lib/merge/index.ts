// The merge (docs/DATA-DESIGN.md, "2. Merge rules"): the plan is the skeleton, the Timeline adds
// actual times and transit modes, photos attach to what those produce, and the owner's edits win
// over all of it. Pure and free of Firebase, so it is tested on its own (docs/ARCHITECTURE.md).
import { applyBlocks } from '../blocks.ts';
import {
  buildTrip,
  legMode,
  type ModelItem,
  type ModelPhoto,
  type TransitMode,
  type Trip,
} from '../model.ts';
import { localMidnightUtc } from '../import/timeline.ts';
import { mediaUrl } from '../media/paths.ts';
import { mapsLink } from '../maps-link.ts';
import type { Edit, JarvisRow, PlanSource, TimelineSegment, TripPhoto } from '../store/types.ts';

/** Starting values from the design, to tune on real data. */
export const THRESHOLDS = {
  /** A visit this close to an entry's place is a candidate for it. */
  matchMetres: 150,
  /** A photo this close to a matched visit's ends still belongs to it. */
  photoSlackMin: 15,
  /** Loose photos further apart than this start a new group. */
  photoGapMin: 45,
  /** Unmatched visits shorter than this aren't suggested. */
  suggestVisitMin: 15,
  /** Unmatched activities shorter than this aren't suggested. */
  suggestActivityKm: 2,
};

const NOT_SUGGESTED = new Set(['HOME', 'INFERRED_HOME', 'WORK', 'INFERRED_WORK']);
const TRANSIT_MODES = new Set(['car', 'train', 'flight', 'bus', 'ferry', 'walk', 'bike']);

const MODES: Record<string, TransitMode> = {
  IN_PASSENGER_VEHICLE: 'car',
  IN_VEHICLE: 'car',
  IN_TAXI: 'car',
  MOTORCYCLING: 'car',
  IN_BUS: 'bus',
  IN_TRAIN: 'train',
  IN_SUBWAY: 'train',
  IN_TRAM: 'train',
  FLYING: 'flight',
  IN_FERRY: 'ferry',
  BOATING: 'ferry',
  SAILING: 'ferry',
  CYCLING: 'bike',
  WALKING: 'walk',
  RUNNING: 'walk',
};

export type MatchedBy = 'id' | 'distance' | 'id+distance' | 'owner';
export type Suggestion = {
  key: string;
  kind: 'visit' | 'activity';
  /** Google's place ID for a visit: "Open in Google Maps" opens that very place. */
  placeId: string | null;
  date: string;
  time: string;
  endTime: string;
  lat: number | null;
  lng: number | null;
  /** Where a journey ended (null for a visit). */
  endLat: number | null;
  endLng: number | null;
  mode: TransitMode | null;
};

export type MergeInput = {
  plan: PlanSource;
  segments: TimelineSegment[];
  photos: TripPhoto[];
  edits: Edit[];
};

/** A visit or journey of the trip's days, for linking one to an entry by hand in edit mode. */
export type SegmentView = {
  key: string;
  kind: 'visit' | 'activity';
  date: string;
  time: string;
  endTime: string;
  lat: number | null;
  lng: number | null;
  /** Where a journey ended (null for a visit). */
  endLat: number | null;
  endLng: number | null;
  placeId: string | null;
  mode: TransitMode | null;
  /** The entry it is matched or linked to, if any. */
  entryId: number | null;
};

/** What the Timeline found about a planned entry: its actual times, and for a leg how it was
 *  travelled. Offered in edit mode; never applied by the merge itself. */
export type Proposal = {
  entryId: number;
  segment: string;
  start: string;
  end: string;
  mode: TransitMode | null;
  /** A stay's actual check-in (`start`, on `inDate`: the next day when arriving after midnight) and
   *  check-out (`end`, on `outDate`): which the Timeline knows. */
  stay?: { checkIn: boolean; checkOut: boolean; inDate: string; outDate: string };
};

/** A position and Google place, as the plan or the Timeline had them before the owner chose another. */
export type PlacePoint = { lat: number | null; lng: number | null; placeId: string | null };

export type MergeResult = {
  trip: Trip;
  /** Where entries (by ID) and stops (by key) were before the owner chose their place (rule 9). */
  placeOverrides: { entries: Record<string, PlacePoint>; suggestions: Record<string, PlacePoint> };
  /** Each located planned entry's Google place and position, as used (the owner's, else the plan's). */
  entryPlaces: Record<string, PlacePoint>;
  /** Jarvis entry ID → the visit or activity that gave it actual times. */
  matches: Record<string, { segment: string; by: MatchedBy | 'time' }>;
  /** Unmatched visits and activities worth offering, shown only in edit mode. */
  suggestions: Suggestion[];
  /** Actual times and travel modes for planned entries, offered in edit mode until accepted or
   *  ignored. */
  proposals: Proposal[];
  /** Planned stops with no visit in the Timeline, for edit mode (unless the owner said that's fine). */
  unvisited: number[];
  /** What the owner set aside, kept so edit mode can show it and bring it back (DESIGN.md, "Edit
   *  mode, round 2", R1): dismissed suggestions, ignored proposals, stops "fine" without a visit. */
  setAside: { dismissed: Suggestion[]; ignored: Proposal[]; fine: number[] };
  /** Every visit and journey of the trip's days, with what it is matched to (edit mode's linking). */
  segments: SegmentView[];
  /** Stops and journeys the owner added from suggestions: their entry ID here, and the suggestion's
   *  key, which is what their edits are kept under. */
  added: { entryId: number; key: string }[];
  /** The owner's hidden photos, with where they would be, for edit mode to show faded. */
  hidden: { id: string; url: string; entryId: number | null; date: string; time: string }[];
  /** Edits whose target is no longer in any source: kept, and listed for the owner. */
  orphanEdits: Edit[];
};

// --- time and place helpers --------------------------------------------------------------------------

const MIN = 60_000;
const pad = (n: number) => String(n).padStart(2, '0');

/** The local date and time of a UTC instant, at a known offset or else in the trip's zone. */
function local(utc: string | number, offsetMin: number | null, timeZone: string) {
  const t = typeof utc === 'number' ? utc : Date.parse(utc);
  if (offsetMin !== null) {
    const d = new Date(t + offsetMin * MIN);
    return {
      date: d.toISOString().slice(0, 10),
      time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
    };
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(t))
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

/** The UTC instant of a local date and time in a zone. */
function utcOf(date: string, time: string, timeZone: string) {
  const [h, m] = time.split(':').map(Number);
  return localMidnightUtc(date, timeZone) + (h * 60 + m) * MIN;
}

function metres(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = Math.PI / 180;
  const x = (bLng - aLng) * rad * Math.cos(((aLat + bLat) / 2) * rad);
  const y = (bLat - aLat) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

const str = (v: JarvisRow[string] | undefined) =>
  v === null || v === undefined ? null : String(v);
const num = (v: JarvisRow[string] | undefined) => (typeof v === 'number' ? v : null);

// --- the merge ---------------------------------------------------------------------------------------

export function merge({ plan, segments, photos, edits }: MergeInput): MergeResult {
  const timeZone = String(plan.destination.timezone);
  const places = new Map(plan.places.map((p) => [p.place_id, p]));
  const use = (target: Edit['target'], key: string, field: string) =>
    edits.find((e) => e.target === target && e.key === key && e.field === field)?.value;

  // Plan entries, joined with their places.
  const rows = plan.itinerary.filter((r) => r.item_type !== 'tag');
  const items: (ModelItem & { googlePlaceId: string | null })[] = rows.map((r) => {
    const p = r.place_id === null ? undefined : places.get(r.place_id);
    return {
      entry_id: Number(r.entry_id),
      item_type: r.item_type as ModelItem['item_type'],
      title: str(r.title),
      place_title: str(p?.title),
      start_date: String(r.start_date),
      end_date: str(r.end_date),
      start_time: str(r.start_time),
      end_time: str(r.end_time),
      notes: str(r.notes),
      lat: num(p?.lat),
      lng: num(p?.lng),
      maps_url: str(p?.maps_url),
      category: str(p?.category),
      from_location: str(r.from_location),
      to_location: str(r.to_location),
      departure_timezone: str(r.departure_timezone),
      arrival_timezone: str(r.arrival_timezone),
      googlePlaceId: str(p?.google_place_id),
    };
  });

  // Rule 9, the owner's place (decided Oct 5, DESIGN.md "Place window"): a planned entry's Google
  // place and position chosen in the place window replace the plan's before anything is matched, so
  // its visit, a stay's visits, its pin and its Google Maps link all follow. An empty place ID is a pin
  // placed by hand, with no Google place. The plan's own are kept, for the window to show.
  const entryPlaceOverrides: Record<string, PlacePoint> = {};
  for (const item of items) {
    const key = String(item.entry_id);
    const id = use('entry', key, 'placeId');
    const la = use('entry', key, 'lat');
    const ln = use('entry', key, 'lng');
    const moved = typeof la === 'number' && typeof ln === 'number';
    if (typeof id !== 'string' && !moved) continue;
    entryPlaceOverrides[key] = { lat: item.lat, lng: item.lng, placeId: item.googlePlaceId };
    if (typeof id === 'string') item.googlePlaceId = id || null;
    if (moved) [item.lat, item.lng] = [la, ln];
    item.maps_url = mapsLink({ lat: item.lat, lng: item.lng, placeId: item.googlePlaceId });
  }

  // Rule 3, visit → entry. A visit near the entry's place or with its place ID is a candidate on the
  // entry's day; the best pair (near and same ID first, then closest to the planned time) wins, and
  // each visit and entry is used once. Stays match on their check-in day.
  const visits = segments.filter((s) => s.kind === 'visit');
  const visitDay = (v: TimelineSegment) => local(v.startUtc, v.startOffsetMin, timeZone).date;
  type Pair = { item: (typeof items)[number]; visit: TimelineSegment; by: MatchedBy; dt: number };
  // The owner's links come first: "this visit is that entry" (also for a leg and its journey), or
  // "this entry has no visit", which keeps it out of the automatic matching.
  const byKey = new Map(segments.map((s) => [s.key, s]));
  const linked = new Map<number, TimelineSegment>();
  const unlinked = new Set<number>();
  for (const item of items) {
    const link = use('entry', String(item.entry_id), 'visit');
    if (link === 'none') unlinked.add(item.entry_id);
    else if (typeof link === 'string' && byKey.has(link))
      linked.set(item.entry_id, byKey.get(link)!);
  }
  const ownerTaken = new Set([...linked.values()].map((s) => s.key));
  const pairs: Pair[] = [];
  for (const item of items) {
    if (linked.has(item.entry_id) || unlinked.has(item.entry_id)) continue;
    const multiDay =
      item.item_type !== 'lodging' && item.end_date && item.end_date > item.start_date;
    if ((item.item_type !== 'place' && item.item_type !== 'lodging') || multiDay) continue;
    const planned = item.start_time ? utcOf(item.start_date, item.start_time, timeZone) : null;
    for (const v of visits) {
      if (ownerTaken.has(v.key) || visitDay(v) !== item.start_date) continue;
      const sameId = !!item.googlePlaceId && v.placeId === item.googlePlaceId;
      const near =
        item.lat !== null &&
        item.lng !== null &&
        v.lat !== null &&
        v.lng !== null &&
        metres(item.lat, item.lng, v.lat, v.lng) <= THRESHOLDS.matchMetres;
      if (!sameId && !near) continue;
      const dt = planned === null ? 0 : Math.abs(Date.parse(v.startUtc) - planned);
      pairs.push({
        item,
        visit: v,
        by: sameId && near ? 'id+distance' : sameId ? 'id' : 'distance',
        dt,
      });
    }
  }
  pairs.sort(
    (a, b) => Number(b.by === 'id+distance') - Number(a.by === 'id+distance') || a.dt - b.dt,
  );
  const matches: MergeResult['matches'] = {};
  const visitOf = new Map<number, TimelineSegment>();
  const takenVisits = new Set<string>();
  const takenActivities = new Set<string>();
  for (const [id, seg] of linked) {
    matches[id] = { segment: seg.key, by: 'owner' };
    if (seg.kind === 'visit') {
      visitOf.set(id, seg);
      takenVisits.add(seg.key);
    } else takenActivities.add(seg.key);
  }
  for (const p of pairs) {
    if (visitOf.has(p.item.entry_id) || takenVisits.has(p.visit.key)) continue;
    visitOf.set(p.item.entry_id, p.visit);
    takenVisits.add(p.visit.key);
    matches[p.item.entry_id] = { segment: p.visit.key, by: p.by };
  }
  // The Timeline changes nothing by itself (decided Oct 3): what it found about a planned entry is a
  // proposal, for the owner to accept in edit mode. Stays have their own rule (rule 8, below).
  const proposals: Proposal[] = [];
  for (const item of items) {
    const v = visitOf.get(item.entry_id);
    if (!v || item.item_type !== 'place') continue;
    const start = local(v.startUtc, v.startOffsetMin, timeZone).time;
    const end = local(v.endUtc, v.endOffsetMin, timeZone).time;
    proposals.push({ entryId: item.entry_id, segment: v.key, start, end, mode: null });
  }

  // Rule 8, stays (decided Oct 5): the actual check-in and check-out come from the stay's visits to the
  // lodging: every visit during the stay near its pin or with its place ID, or near the visit the
  // owner linked (which shows where the lodging really is). Check-in: the first arrival on the
  // check-in day (or, arriving after midnight, before noon the next day); check-out: the last
  // departure on the check-out day. Proposed together, as one finding; either may be unknown.
  const stayVisits = new Map<number, TimelineSegment[]>();
  const nextDay = (date: string) =>
    new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const close = (
    a: { lat: number | null; lng: number | null },
    b: { lat: number | null; lng: number | null },
  ) =>
    a.lat !== null &&
    a.lng !== null &&
    b.lat !== null &&
    b.lng !== null &&
    metres(a.lat, a.lng, b.lat, b.lng) <= THRESHOLDS.matchMetres;
  for (const st of items) {
    if (st.item_type !== 'lodging' || unlinked.has(st.entry_id)) continue;
    const anchor = visitOf.get(st.entry_id);
    const last = st.end_date ?? st.start_date;
    const atLodging = (v: TimelineSegment) =>
      (!!st.googlePlaceId && v.placeId === st.googlePlaceId) ||
      close(st, v) ||
      (!!anchor && ((!!anchor.placeId && v.placeId === anchor.placeId) || close(anchor, v)));
    const mine = visits
      .filter((v) => {
        if (v !== anchor && takenVisits.has(v.key)) return false;
        const from = local(v.startUtc, v.startOffsetMin, timeZone).date;
        const to = local(v.endUtc, v.endOffsetMin, timeZone).date;
        return to >= st.start_date && from <= last && atLodging(v);
      })
      .sort((a, b) => a.startUtc.localeCompare(b.startUtc));
    stayVisits.set(st.entry_id, mine);
    const startOf = (v: TimelineSegment) => local(v.startUtc, v.startOffsetMin, timeZone);
    const endOf = (v: TimelineSegment) => local(v.endUtc, v.endOffsetMin, timeZone);
    const checkIn =
      mine.find((v) => startOf(v).date === st.start_date) ??
      mine.find((v) => startOf(v).date === nextDay(st.start_date) && startOf(v).time < '12:00');
    const checkOut = [...mine].reverse().find((v) => endOf(v).date === last);
    if (!checkIn && !checkOut) continue;
    proposals.push({
      entryId: st.entry_id,
      segment: (checkIn ?? checkOut)!.key,
      start: checkIn ? startOf(checkIn).time : '',
      end: checkOut ? endOf(checkOut).time : '',
      mode: null,
      stay: {
        checkIn: !!checkIn,
        checkOut: !!checkOut,
        inDate: checkIn ? startOf(checkIn).date : st.start_date,
        outDate: last,
      },
    });
  }

  // Rule 4, activity → transit: the activity that overlaps the planned leg most sets its mode and
  // actual times.
  const activities = segments.filter((s) => s.kind === 'activity');
  const proposeLeg = (item: (typeof items)[number], a: TimelineSegment) =>
    proposals.push({
      entryId: item.entry_id,
      segment: a.key,
      start: local(a.startUtc, a.startOffsetMin, timeZone).time,
      end: local(a.endUtc, a.endOffsetMin, timeZone).time,
      mode: (a.mode ? MODES[a.mode] : undefined) ?? null,
    });
  for (const item of items) {
    const seg = linked.get(item.entry_id);
    if (item.item_type === 'transit' && seg?.kind === 'activity') proposeLeg(item, seg);
  }
  for (const item of items.filter(
    (i) =>
      i.item_type === 'transit' &&
      i.start_time &&
      !linked.has(i.entry_id) &&
      !unlinked.has(i.entry_id),
  )) {
    const from = utcOf(item.start_date, item.start_time!, item.departure_timezone ?? timeZone);
    const to = item.end_time
      ? utcOf(item.end_date ?? item.start_date, item.end_time, item.arrival_timezone ?? timeZone)
      : from;
    let best: TimelineSegment | undefined;
    let bestOverlap = 0;
    for (const a of activities) {
      if (takenActivities.has(a.key)) continue;
      const overlap = Math.min(to, Date.parse(a.endUtc)) - Math.max(from, Date.parse(a.startUtc));
      if (overlap > bestOverlap) [best, bestOverlap] = [a, overlap];
    }
    if (!best) continue;
    takenActivities.add(best.key);
    matches[item.entry_id] = { segment: best.key, by: 'time' };
    proposeLeg(item, best);
  }

  // Rule 5, suggestions: what's left, minus noise. A visit that contains a matched one (or sits in
  // it) is the same stop at another level, not a new one.
  const tripStart = str(plan.trip.start_date);
  const tripEnd = str(plan.trip.end_date);
  const inTrip = (date: string) =>
    (!tripStart || date >= tripStart) && (!tripEnd || date <= tripEnd);
  const overlaps = (a: TimelineSegment, b: TimelineSegment) =>
    Date.parse(a.startUtc) < Date.parse(b.endUtc) && Date.parse(b.startUtc) < Date.parse(a.endUtc);
  const matchedVisits = visits.filter((v) => takenVisits.has(v.key));
  // Coming back to the lodging on any day of the stay is the stay, not a new stop.
  const stays = items.filter((i) => i.item_type === 'lodging');
  const atStay = (st: (typeof items)[number], v: TimelineSegment, date: string) =>
    date >= st.start_date &&
    date <= (st.end_date ?? st.start_date) &&
    ((!!st.googlePlaceId && v.placeId === st.googlePlaceId) ||
      (st.lat !== null &&
        st.lng !== null &&
        v.lat !== null &&
        v.lng !== null &&
        metres(st.lat, st.lng, v.lat, v.lng) <= THRESHOLDS.matchMetres));
  const suggestions: Suggestion[] = [];
  const dismissed: Suggestion[] = [];
  const suggestionPlaceOverrides: Record<string, PlacePoint> = {};
  for (const s of segments) {
    if (takenVisits.has(s.key) || takenActivities.has(s.key)) continue;
    const start = local(s.startUtc, s.startOffsetMin, timeZone);
    if (!inTrip(start.date)) continue;
    const minutes = (Date.parse(s.endUtc) - Date.parse(s.startUtc)) / MIN;
    if (s.kind === 'visit') {
      if (minutes < THRESHOLDS.suggestVisitMin || NOT_SUGGESTED.has(s.semanticType ?? '')) continue;
      if (matchedVisits.some((m) => m.hierarchyLevel !== s.hierarchyLevel && overlaps(m, s)))
        continue;
      if (stays.some((st) => atStay(st, s, start.date))) continue;
    } else if ((s.distanceMeters ?? 0) / 1000 <= THRESHOLDS.suggestActivityKm) continue;
    // The owner's place for a stop (rule 9): its Google place and position, chosen in the window.
    const id = use('suggestion', s.key, 'placeId');
    const la = use('suggestion', s.key, 'lat');
    const ln = use('suggestion', s.key, 'lng');
    const moved = typeof la === 'number' && typeof ln === 'number';
    if (typeof id === 'string' || moved)
      suggestionPlaceOverrides[s.key] = { lat: s.lat, lng: s.lng, placeId: s.placeId };
    (use('suggestion', s.key, 'dismissed') === true ? dismissed : suggestions).push({
      key: s.key,
      kind: s.kind,
      placeId: typeof id === 'string' ? id || null : s.placeId,
      date: start.date,
      time: start.time,
      endTime: local(s.endUtc, s.endOffsetMin, timeZone).time,
      lat: moved ? la : s.lat,
      lng: moved ? ln : s.lng,
      endLat: s.kind === 'activity' ? s.endLat : null,
      endLng: s.kind === 'activity' ? s.endLng : null,
      mode: s.kind === 'activity' && s.mode ? (MODES[s.mode] ?? null) : null,
    });
  }
  // An approved suggestion becomes an entry, titled by the owner (a visit) or by its mode.
  const approved = suggestions.filter((s) => use('suggestion', s.key, 'approved') === true);
  approved.forEach((s, n) => {
    const title = use('suggestion', s.key, 'title');
    // Its times: kept, the owner's own ("HH:MM-HH:MM"), or none.
    const times = use('suggestion', s.key, 'times');
    const own = typeof times === 'string' ? times.match(/^(\d\d:\d\d)-(\d\d:\d\d)$/) : null;
    items.push({
      entry_id: -(n + 1),
      item_type: s.kind === 'visit' ? 'place' : 'transit',
      title: typeof title === 'string' ? title : s.kind === 'visit' ? 'Stop' : 'Journey',
      place_title: null,
      start_date: s.date,
      end_date: null,
      start_time: times === 'none' ? null : own ? own[1] : s.time,
      end_time: times === 'none' ? null : own ? own[2] : s.endTime,
      notes: null,
      lat: s.lat,
      lng: s.lng,
      maps_url: s.kind === 'visit' ? mapsLink(s) : null,
      category: null,
      from_location: null,
      to_location: null,
      departure_timezone: null,
      arrival_timezone: null,
      mode: s.mode,
      googlePlaceId: s.kind === 'visit' ? s.placeId : null,
    });
  });
  const remaining = suggestions.filter((s) => !approved.includes(s));

  // Entry edits: text, times (an empty value clears them), travel mode, highlight, hiding.
  const shown = items.filter((item) => {
    const key = String(item.entry_id);
    if (use('entry', key, 'hidden') === true) return false;
    for (const field of ['title', 'notes', 'start_time', 'end_time'] as const) {
      const v = use('entry', key, field);
      if (typeof v === 'string') item[field] = field.endsWith('_time') && v === '' ? null : v;
    }
    // Moved to another day (a stay checked into after midnight), never past its own end.
    const day = use('entry', key, 'start_date');
    if (typeof day === 'string' && (!item.end_date || day <= item.end_date)) item.start_date = day;
    const mode = use('entry', key, 'mode');
    if (item.item_type === 'transit' && typeof mode === 'string' && TRANSIT_MODES.has(mode))
      item.mode = mode as TransitMode;
    if (use('entry', key, 'highlighted') === true) item.highlighted = true;
    return true;
  });

  // What still needs the owner: a proposal is gone once accepted (the entry's times and mode are
  // the Timeline's) or ignored; a planned stop with no visit is listed unless they said that's fine.
  const shownById = new Map(shown.map((i) => [i.entry_id, i]));
  const differs = (p: Proposal) => {
    const item = shownById.get(p.entryId);
    return (
      !!item &&
      // A side the Timeline doesn't know (a stay's check-in or check-out) isn't compared.
      ((p.stay?.checkIn !== false &&
        (p.start !== item.start_time || (!!p.stay && p.stay.inDate !== item.start_date))) ||
        (p.stay?.checkOut !== false && p.end !== item.end_time) ||
        // A leg's mode as drawn (its own, else from its title), so "Use" settles it.
        (p.mode !== null && item.item_type === 'transit' && p.mode !== legMode(item)))
    );
  };
  const isIgnored = (p: Proposal) => use('entry', String(p.entryId), 'proposal') === 'ignored';
  const open = proposals.filter((p) => differs(p) && !isIgnored(p));
  const ignored = proposals.filter((p) => differs(p) && isIgnored(p));
  const noVisit = segments.some((s) => s.kind === 'visit')
    ? shown.filter(
        (i) =>
          i.item_type === 'place' &&
          i.entry_id > 0 &&
          !(i.end_date && i.end_date > i.start_date) &&
          !visitOf.has(i.entry_id),
      )
    : [];
  const isFine = (i: ModelItem) => use('entry', String(i.entry_id), 'noVisit') === true;
  const unvisited = noVisit.filter((i) => !isFine(i)).map((i) => i.entry_id);
  const fine = noVisit.filter(isFine).map((i) => i.entry_id);
  const entryIds = new Set(shown.map((i) => String(i.entry_id)));

  // Rule 6, photos: local time from EXIF, else the Timeline at that moment, else the trip's zone; a
  // photo taken during a matched visit (with some slack) belongs to its entry, unless the owner moved
  // it; the rest are loose moments, grouped by time gaps.
  const segmentAt = (t: number) =>
    segments.find((s) => Date.parse(s.startUtc) <= t && t <= Date.parse(s.endUtc));
  const slack = THRESHOLDS.photoSlackMin * MIN;
  const sorted = [...photos].sort(
    (a, b) => a.takenUtc.localeCompare(b.takenUtc) || a.mediaId.localeCompare(b.mediaId),
  );
  const modelPhotos: ModelPhoto[] = [];
  const hiddenPhotos: ModelPhoto[] = [];
  sorted.forEach((p, n) => {
    const t = Date.parse(p.takenUtc);
    const seg = segmentAt(t);
    const offset = p.offsetMin ?? seg?.startOffsetMin ?? null;
    const when = local(t, offset, timeZone);

    let entry: number | null = null;
    const moved = use('photo', p.mediaId, 'entry');
    if (moved !== undefined)
      entry = moved === null || !entryIds.has(String(moved)) ? null : Number(moved);
    else {
      for (const [id, v] of visitOf)
        if (
          entryIds.has(String(id)) &&
          Date.parse(v.startUtc) - slack <= t &&
          t <= Date.parse(v.endUtc) + slack
        )
          entry = id;
      // At the lodging on any night of a stay: the stay's photo.
      if (entry === null)
        for (const [id, vs] of stayVisits)
          if (
            entryIds.has(String(id)) &&
            vs.some((v) => Date.parse(v.startUtc) - slack <= t && t <= Date.parse(v.endUtc) + slack)
          )
            entry = id;
    }

    // Where it was taken: its visit's place, or along an activity in proportion to the time.
    let lat: number | null = null;
    let lng: number | null = null;
    if (seg?.kind === 'visit') [lat, lng] = [seg.lat, seg.lng];
    else if (seg?.kind === 'activity' && seg.lat !== null && seg.endLat !== null) {
      const f =
        (t - Date.parse(seg.startUtc)) / (Date.parse(seg.endUtc) - Date.parse(seg.startUtc) || 1);
      lat = seg.lat + (seg.endLat - seg.lat) * f;
      lng = seg.lng! + (seg.endLng! - seg.lng!) * f;
    }
    const caption = use('photo', p.mediaId, 'caption');
    // A hidden photo is kept aside, so edit mode can show it faded and bring it back.
    (use('photo', p.mediaId, 'hidden') === true ? hiddenPhotos : modelPhotos).push({
      id: p.mediaId,
      photo_id: n + 1,
      entry_id: entry,
      url: mediaUrl((p.kind === 'video' ? p.files.still : p.files.display) ?? ''),
      ...(p.files.thumb ? { thumb: mediaUrl(p.files.thumb) } : {}),
      caption: typeof caption === 'string' ? caption : '',
      ...(use('photo', p.mediaId, 'highlighted') === true ? { highlighted: true as const } : {}),
      lat,
      lng,
      date: when.date,
      time: when.time,
    });
  });
  const looseGroups: ModelPhoto[][] = [];
  for (const p of modelPhotos.filter((x) => x.entry_id === null)) {
    const group = looseGroups[looseGroups.length - 1];
    const last = group?.[group.length - 1];
    const gap = last
      ? (Date.parse(`${p.date}T${p.time}:00Z`) - Date.parse(`${last.date}T${last.time}:00Z`)) / MIN
      : Infinity;
    if (last && last.date === p.date && gap <= THRESHOLDS.photoGapMin) group.push(p);
    else looseGroups.push([p]);
  }

  // Day titles, tags and the trip's own text.
  const dayTitles = new Map<string, string>();
  for (const e of edits)
    if (e.target === 'day' && e.field === 'title' && typeof e.value === 'string')
      dayTitles.set(e.key, e.value);
  const subtitle = use('trip', String(plan.trip.trip_id), 'subtitle');
  const title = use('trip', String(plan.trip.trip_id), 'title');
  const tags = plan.itinerary.filter((r) => r.item_type === 'tag');

  const trip = buildTrip({
    trip: {
      title:
        typeof title === 'string' ? title : (str(plan.trip.title) ?? String(plan.destination.name)),
      subtitle: typeof subtitle === 'string' ? subtitle : null,
      start_date: tripStart,
      end_date: tripEnd,
      destination: String(plan.destination.name),
      timezone: timeZone,
      lat: num(plan.destination.lat),
      lng: num(plan.destination.lng),
    },
    items: [
      ...shown,
      ...tags.map((r) => ({
        entry_id: Number(r.entry_id),
        item_type: 'tag' as const,
        title: str(r.title),
        place_title: null,
        start_date: String(r.start_date),
        end_date: null,
        start_time: null,
        end_time: null,
        notes: null,
        lat: null,
        lng: null,
        maps_url: null,
        category: null,
        from_location: null,
        to_location: null,
        departure_timezone: null,
        arrival_timezone: null,
      })),
    ],
    photos: modelPhotos,
    looseGroups,
    dayTitles,
  });

  // An edit whose target no source has any more is kept, and listed for the owner (never dropped).
  const exists: Record<Edit['target'], (key: string) => boolean> = {
    trip: (k) => k === String(plan.trip.trip_id),
    day: (k) => !!tripStart && !!tripEnd && k >= tripStart && k <= tripEnd,
    entry: (k) => plan.itinerary.some((r) => String(r.entry_id) === k),
    place: (k) => plan.places.some((p) => String(p.place_id) === k),
    photo: (k) => photos.some((p) => p.mediaId === k),
    suggestion: (k) => segments.some((s) => s.key === k),
    // A block is the owner's own: it exists by its edits.
    block: () => true,
  };
  const orphanEdits = edits.filter((e) => !exists[e.target](e.key));
  const matchedTo = new Map(Object.entries(matches).map(([id, m]) => [m.segment, Number(id)]));
  const views: SegmentView[] = segments.flatMap((s) => {
    const a = local(s.startUtc, s.startOffsetMin, timeZone);
    if (!inTrip(a.date)) return [];
    return [
      {
        key: s.key,
        kind: s.kind,
        date: a.date,
        time: a.time,
        endTime: local(s.endUtc, s.endOffsetMin, timeZone).time,
        lat: s.lat,
        lng: s.lng,
        endLat: s.kind === 'activity' ? s.endLat : null,
        endLng: s.kind === 'activity' ? s.endLng : null,
        placeId: s.placeId,
        mode: s.kind === 'activity' && s.mode ? (MODES[s.mode] ?? null) : null,
        entryId: matchedTo.get(s.key) ?? null,
      },
    ];
  });
  // The photos an entry shows on the journey, in the owner's order, come first (MP1).
  for (const d of trip.days)
    for (const e of d.entries) {
      const main = /^i\d+$/.test(e.id) ? use('entry', e.id.slice(1), 'photos') : undefined;
      if (typeof main !== 'string' || !main) continue;
      const order = main.split(',');
      const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
      e.photos = [...e.photos].sort((a, b) => rank(a.id) - rank(b.id));
    }
  // Blocks: the owner's groups of entries (DESIGN.md, "Blocks").
  applyBlocks(trip, edits, new Map(approved.map((s, n) => [s.key, `i${-(n + 1)}`])));
  // Shown only as small tiles in edit mode: the thumbnail where there is one.
  const hidden = hiddenPhotos.map((p) => ({
    id: p.id!,
    url: p.thumb ?? p.url,
    entryId: p.entry_id,
    date: p.date,
    time: p.time,
  }));
  return {
    trip,
    matches,
    suggestions: remaining,
    proposals: open,
    unvisited,
    setAside: { dismissed, ignored, fine },
    segments: views,
    hidden,
    added: approved.map((s, n) => ({ entryId: -(n + 1), key: s.key })),
    placeOverrides: { entries: entryPlaceOverrides, suggestions: suggestionPlaceOverrides },
    entryPlaces: Object.fromEntries(
      items
        .filter((i) => i.entry_id > 0 && (i.lat !== null || i.googlePlaceId))
        .map((i) => [String(i.entry_id), { lat: i.lat, lng: i.lng, placeId: i.googlePlaceId }]),
    ),
    orphanEdits,
  };
}
