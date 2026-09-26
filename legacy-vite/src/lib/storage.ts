/**
 * Device-local persistence.
 *
 * The whole trip lives under one localStorage key as versioned JSON.
 * This keeps the app backend-free: data stays on the user's device,
 * survives across sessions, and can be moved between devices with
 * the JSON export/import buttons in the UI.
 *
 * If storage needs grow (large photo blobs), swap this module for
 * IndexedDB (e.g. idb-keyval) - every caller goes through these
 * functions, so nothing else has to change.
 */
import { PersistedTrip, SCHEMA_VERSION, Trip } from '../types';

const STORAGE_KEY = 'trip-summary/trip';

export function loadTrip(): Trip | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedTrip;
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      // Migration hook for future schema changes.
      console.warn(`Stored trip has schema v${parsed.schemaVersion}, expected v${SCHEMA_VERSION}. Loading as-is.`);
    }
    return parsed.trip;
  } catch (err) {
    console.error('Failed to load trip from localStorage', err);
    return null;
  }
}

export function saveTrip(trip: Trip): void {
  const payload: PersistedTrip = {
    schemaVersion: SCHEMA_VERSION,
    trip: { ...trip, updatedAt: new Date().toISOString() },
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clearTrip(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Download the trip as a JSON file (backup / move between devices). */
export function exportTripToFile(trip: Trip): void {
  const payload: PersistedTrip = { schemaVersion: SCHEMA_VERSION, trip };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${trip.name.replace(/\s+/g, '-').toLowerCase() || 'trip'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Parse a previously exported trip JSON file. Throws on invalid content. */
export function parseTripExport(text: string): Trip {
  const parsed = JSON.parse(text) as PersistedTrip;
  if (!parsed || typeof parsed !== 'object' || !parsed.trip || !Array.isArray(parsed.trip.days)) {
    throw new Error('Not a valid trip export file.');
  }
  return parsed.trip;
}
