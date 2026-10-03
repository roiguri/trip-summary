// Links into Google Maps (DESIGN.md, "Edit mode": "Open in Google Maps", until the Places API): a place
// at its point (at Google's own place when its ID is known), and a journey as directions from where
// it started to where it ended, in its travel mode.
import type { TransitMode } from './model.ts';

type Point = { lat: number | null; lng: number | null };
export type Linkable = Point & {
  kind?: 'visit' | 'activity';
  endLat?: number | null;
  endLng?: number | null;
  placeId?: string | null;
  mode?: TransitMode | null;
};

/** Google Maps' travel modes; a flight has none (directions then default to driving, so omit it). */
const TRAVEL: Partial<Record<TransitMode, string>> = {
  car: 'driving',
  walk: 'walking',
  bike: 'bicycling',
  bus: 'transit',
  train: 'transit',
  ferry: 'transit',
};

export function mapsLink(x: Linkable): string | null {
  if (x.lat == null || x.lng == null) return null;
  if (x.kind === 'activity' && x.endLat != null && x.endLng != null) {
    const mode = x.mode ? TRAVEL[x.mode] : undefined;
    return (
      `https://www.google.com/maps/dir/?api=1&origin=${x.lat},${x.lng}` +
      `&destination=${x.endLat},${x.endLng}${mode ? `&travelmode=${mode}` : ''}`
    );
  }
  return (
    `https://www.google.com/maps/search/?api=1&query=${x.lat},${x.lng}` +
    (x.placeId ? `&query_place_id=${encodeURIComponent(x.placeId)}` : '')
  );
}
