/**
 * Core data model for the trip summary app.
 *
 * A Trip is the unit of persistence. It is built by merging three sources:
 *   1. A Google Photos album export        -> photos, grouped by day
 *   2. A Google Maps Timeline export       -> visited places, grouped by day
 *   3. The user's own planning/notes JSON  -> notes, recommendations, planned places
 *
 * After merging, the user reviews the unified day-by-day timeline in the app:
 * marking highlights, favoriting photos, and editing recommendations.
 * Everything is stored locally in the browser (localStorage); no backend.
 */

/** High-level buckets used by the "by category" view. */
export type Category =
  | 'restaurant'
  | 'attraction'
  | 'accommodation'
  | 'activity'
  | 'transport'
  | 'other';

export const ALL_CATEGORIES: Category[] = [
  'restaurant',
  'attraction',
  'accommodation',
  'activity',
  'transport',
  'other',
];

export interface PhotoRef {
  id: string;
  /** Local object URL or remote URL. Google Photos imports may only have a file name. */
  url?: string;
  fileName?: string;
  description?: string;
  /** ISO timestamp when the photo was taken, if known. */
  takenAt?: string;
  favorite: boolean;
  source: 'google-photos' | 'manual';
}

export interface PlaceVisit {
  id: string;
  name: string;
  category: Category;
  address?: string;
  lat?: number;
  lng?: number;
  /** ISO timestamps for the visit window, if known (from Maps timeline). */
  startTime?: string;
  endTime?: string;
  /** Free-text recommendation / review the user writes during review. */
  recommendation?: string;
  /** Optional 1-5 rating. */
  rating?: number;
  /** Marked as a trip highlight during review. */
  highlight: boolean;
  source: 'google-maps' | 'notes' | 'manual';
}

export interface DayEntry {
  /** Calendar day in YYYY-MM-DD. Primary grouping key for the whole app. */
  date: string;
  /** Optional short label, e.g. "Arrival in Taipei". */
  title?: string;
  /** Free-text diary notes for the day. */
  notes: string;
  places: PlaceVisit[];
  photos: PhotoRef[];
  /** Marked as a highlight day during review. */
  highlight: boolean;
}

export interface Trip {
  id: string;
  name: string;
  /** YYYY-MM-DD; derived from the data but editable. */
  startDate: string;
  endDate: string;
  days: DayEntry[];
  /** ISO timestamp of the last local save. */
  updatedAt: string;
}

/** Schema version stamped onto persisted data so future migrations have a hook. */
export const SCHEMA_VERSION = 1;

export interface PersistedTrip {
  schemaVersion: number;
  trip: Trip;
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyTrip(name = 'My trip'): Trip {
  return {
    id: newId('trip'),
    name,
    startDate: '',
    endDate: '',
    days: [],
    updatedAt: new Date().toISOString(),
  };
}
