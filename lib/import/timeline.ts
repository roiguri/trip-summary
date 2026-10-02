// Reads the Android Timeline export (docs/DATA-DESIGN.md, "Timeline slicing"). Slicing and parsing
// use nothing but the language, so the import page can run them in the browser: only the trip's
// slice is ever uploaded, and the rest of the owner's history never leaves their device.
import type { TimelineSegment } from '../store/types.ts';

type RawSegment = {
  startTime: string;
  endTime: string;
  startTimeTimezoneUtcOffsetMinutes?: number;
  endTimeTimezoneUtcOffsetMinutes?: number;
  visit?: {
    hierarchyLevel?: number;
    probability?: number;
    topCandidate?: {
      placeId?: string;
      semanticType?: string;
      probability?: number;
      placeLocation?: { latLng?: string };
    };
  };
  activity?: {
    start?: { latLng?: string };
    end?: { latLng?: string };
    distanceMeters?: number;
    probability?: number;
    topCandidate?: { type?: string; probability?: number };
  };
};

export type TripWindow = { startDate: string | null; endDate: string | null; timezone: string };

const DAY = 86_400_000;

/** "36.5552000°, -121.9246000°" → [36.5552, -121.9246]; anything else → null. */
export function parseLatLng(text: string | undefined): [number, number] | null {
  const m = text?.match(/^\s*(-?\d+(?:\.\d+)?)°\s*,\s*(-?\d+(?:\.\d+)?)°\s*$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** The UTC instant of local midnight on a date in a time zone. */
export function localMidnightUtc(date: string, timeZone: string): number {
  const guess = Date.parse(`${date}T00:00:00Z`);
  // The zone's offset at that moment, read from Intl (e.g. "GMT-07:00"); applied twice to settle
  // on the right side of a daylight-saving change.
  const offsetAt = (t: number) => {
    const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(new Date(t))
      .find((p) => p.type === 'timeZoneName')!.value;
    const m = name.match(/GMT([+-])(\d\d):(\d\d)/);
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60_000 : 0;
  };
  const first = guess - offsetAt(guess);
  return guess - offsetAt(first);
}

/** The slice of time kept: the trip's dates plus one day either side, in the trip's local time. */
export function sliceWindow(trip: TripWindow) {
  if (!trip.startDate || !trip.endDate)
    throw new Error('The trip needs dates before a Timeline can be added');
  return {
    from: localMidnightUtc(trip.startDate, trip.timezone) - DAY,
    to: localMidnightUtc(trip.endDate, trip.timezone) + 2 * DAY,
  };
}

/** One raw segment as stored, or null for kinds the app drops (paths, memories). */
export function parseSegment(s: RawSegment): TimelineSegment | null {
  const startUtc = new Date(s.startTime).toISOString();
  const endUtc = new Date(s.endTime).toISOString();
  const offsets = {
    startOffsetMin: s.startTimeTimezoneUtcOffsetMinutes ?? null,
    endOffsetMin: s.endTimeTimezoneUtcOffsetMinutes ?? null,
  };
  if (s.visit) {
    const c = s.visit.topCandidate ?? {};
    const at = parseLatLng(c.placeLocation?.latLng);
    const placeId = c.placeId ?? null;
    return {
      key: `visit:${startUtc}:${placeId ?? 'unknown'}`,
      kind: 'visit',
      startUtc,
      endUtc,
      ...offsets,
      probability: s.visit.probability ?? null,
      lat: at?.[0] ?? null,
      lng: at?.[1] ?? null,
      placeId,
      semanticType: c.semanticType ?? null,
      hierarchyLevel: s.visit.hierarchyLevel ?? null,
      endLat: null,
      endLng: null,
      mode: null,
      distanceMeters: null,
    };
  }
  if (s.activity) {
    const a = parseLatLng(s.activity.start?.latLng);
    const b = parseLatLng(s.activity.end?.latLng);
    const mode = s.activity.topCandidate?.type ?? null;
    return {
      key: `activity:${startUtc}:${mode ?? 'unknown'}`,
      kind: 'activity',
      startUtc,
      endUtc,
      ...offsets,
      probability: s.activity.probability ?? null,
      lat: a?.[0] ?? null,
      lng: a?.[1] ?? null,
      placeId: null,
      semanticType: null,
      hierarchyLevel: null,
      endLat: b?.[0] ?? null,
      endLng: b?.[1] ?? null,
      mode,
      distanceMeters: s.activity.distanceMeters ?? null,
    };
  }
  return null;
}

/** The visits and activities that overlap the trip's slice, parsed. Everything else is left behind. */
export function sliceTimeline(exported: unknown, trip: TripWindow): TimelineSegment[] {
  const raw = (exported as { semanticSegments?: RawSegment[] })?.semanticSegments;
  if (!Array.isArray(raw)) throw new Error('Not an Android Timeline export: no "semanticSegments"');
  const { from, to } = sliceWindow(trip);
  const out = new Map<string, TimelineSegment>();
  for (const s of raw) {
    if (!s.visit && !s.activity) continue;
    if (Date.parse(s.endTime) < from || Date.parse(s.startTime) >= to) continue;
    const seg = parseSegment(s);
    if (seg) out.set(seg.key, seg);
  }
  return [...out.values()].sort((a, b) => a.startUtc.localeCompare(b.startUtc));
}
