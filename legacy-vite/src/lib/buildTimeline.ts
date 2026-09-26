/**
 * Timeline builder: merges imported sources into one unified,
 * day-by-day trip structure.
 *
 * Merge rules:
 *   - Days are keyed by calendar date (YYYY-MM-DD) in the device's
 *     local timezone (the timezone the user reviews in).
 *   - Notes-file days merge field-by-field into existing days.
 *   - Places and photos are appended; de-duplication is intentionally
 *     conservative (same name + same day) because the user reviews and
 *     edits the result anyway.
 */
import { DayEntry, PhotoRef, PlaceVisit, Trip, emptyTrip } from '../types';

export function dateOf(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getOrCreateDay(map: Map<string, DayEntry>, date: string): DayEntry {
  let day = map.get(date);
  if (!day) {
    day = { date, notes: '', places: [], photos: [], highlight: false };
    map.set(date, day);
  }
  return day;
}

export interface MergeInput {
  tripName?: string;
  noteDays?: DayEntry[];
  places?: PlaceVisit[];
  photos?: PhotoRef[];
  /** Base to merge into; pass the current trip when re-importing. */
  base?: Trip;
}

export function buildTimeline(input: MergeInput): Trip {
  const trip: Trip = input.base
    ? { ...input.base, days: input.base.days.map((d) => ({ ...d, places: [...d.places], photos: [...d.photos] })) }
    : emptyTrip(input.tripName ?? 'My trip');
  if (input.tripName) trip.name = input.tripName;

  const byDate = new Map<string, DayEntry>(trip.days.map((d) => [d.date, d]));

  for (const nd of input.noteDays ?? []) {
    const day = getOrCreateDay(byDate, nd.date);
    day.title = day.title ?? nd.title;
    day.notes = day.notes ? `${day.notes}\n${nd.notes}`.trim() : nd.notes;
    for (const p of nd.places) {
      if (!day.places.some((x) => x.name === p.name)) day.places.push(p);
    }
  }

  for (const p of input.places ?? []) {
    const date = dateOf(p.startTime);
    if (!date) continue;
    const day = getOrCreateDay(byDate, date);
    if (!day.places.some((x) => x.name === p.name)) day.places.push(p);
  }

  for (const ph of input.photos ?? []) {
    const date = dateOf(ph.takenAt);
    if (!date) continue;
    const day = getOrCreateDay(byDate, date);
    if (!day.photos.some((x) => x.fileName && x.fileName === ph.fileName)) day.photos.push(ph);
  }

  trip.days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  trip.startDate = trip.days[0]?.date ?? '';
  trip.endDate = trip.days[trip.days.length - 1]?.date ?? '';
  trip.updatedAt = new Date().toISOString();
  return trip;
}
