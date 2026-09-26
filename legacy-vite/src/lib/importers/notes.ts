/**
 * Importer: the user's own trip planning / notes JSON.
 *
 * This is the structure the trip owner maintains by hand (or exports from
 * a planning doc). It is the richest source: it can carry planned places,
 * recommendations, and per-day notes BEFORE the trip even happens.
 *
 * Documented shape (see README for a full example):
 * {
 *   "tripName": "Taiwan 2026",
 *   "days": [
 *     {
 *       "date": "2026-09-25",
 *       "title": "Arrival in Taipei",
 *       "notes": "Landed 14:00, metro to the city.",
 *       "places": [
 *         { "name": "Din Tai Fung", "category": "restaurant",
 *           "recommendation": "Get the xiaolongbao", "rating": 5 }
 *       ]
 *     }
 *   ]
 * }
 */
import { DayEntry, PlaceVisit, newId } from '../../types';

export interface NotesFile {
  tripName?: string;
  days?: Array<{
    date: string;
    title?: string;
    notes?: string;
    places?: Array<Partial<PlaceVisit> & { name: string }>;
  }>;
}

export function importNotes(text: string): { tripName?: string; days: DayEntry[] } {
  const data = JSON.parse(text) as NotesFile;
  if (!data || !Array.isArray(data.days)) {
    throw new Error('Notes file must be JSON with a "days" array. See README for the format.');
  }
  const days: DayEntry[] = data.days
    .filter((d) => typeof d.date === 'string' && d.date.length >= 8)
    .map((d) => ({
      date: d.date,
      title: d.title,
      notes: d.notes ?? '',
      highlight: false,
      photos: [],
      places: (d.places ?? []).map((p) => ({
        id: newId('place'),
        name: p.name,
        category: p.category ?? 'other',
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        recommendation: p.recommendation,
        rating: p.rating,
        highlight: p.highlight ?? false,
        source: 'notes' as const,
      })),
    }));
  return { tripName: data.tripName, days };
}
