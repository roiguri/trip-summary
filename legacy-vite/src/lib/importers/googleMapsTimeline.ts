/**
 * Importer: Google Maps Timeline export.
 *
 * Google Takeout (and the on-device Timeline export) produce location
 * history as JSON. Two shapes exist in the wild:
 *
 *   A. "Semantic Location History" (older Takeout):
 *      { "timelineObjects": [ { "placeVisit": {...} }, { "activitySegment": {...} } ] }
 *
 *   B. On-device Timeline export (newer, Timeline.json):
 *      { "semanticSegments": [ { "visit": {...} }, { "activity": {...} }, ... ] }
 *
 * This importer extracts PLACE VISITS from either shape and returns them
 * as partial PlaceVisits with timestamps, so the timeline builder can group
 * them by day. Activity segments (movement) are mapped to 'transport'.
 *
 * Google changes this format from time to time - if your export does not
 * parse, log its top-level keys and extend the parsers below.
 */
import { PlaceVisit, newId } from '../../types';

interface RawVisit {
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
  startTime?: string;
  endTime?: string;
  category?: PlaceVisit['category'];
}

function parseLatLng(value: unknown): number | undefined {
  // Takeout encodes coordinates as degrees * 1e7 (e.g. 250559910 -> 25.055991).
  if (typeof value !== 'number') return undefined;
  const deg = value / 1e7;
  return Math.abs(deg) <= 180 ? deg : undefined;
}

function fromPlaceVisit(placeVisit: Record<string, unknown>): RawVisit | null {
  const location = (placeVisit.location ?? {}) as Record<string, unknown>;
  const duration = (placeVisit.duration ?? {}) as Record<string, unknown>;
  const name = (location.name ?? location.address) as string | undefined;
  if (!name) return null;
  return {
    name,
    address: location.address as string | undefined,
    lat: parseLatLng(location.latitudeE7),
    lng: parseLatLng(location.longitudeE7),
    startTime: duration.startTimestamp as string | undefined,
    endTime: duration.endTimestamp as string | undefined,
  };
}

function fromSemanticSegment(segment: Record<string, unknown>): RawVisit | null {
  const visit = segment.visit as Record<string, unknown> | undefined;
  if (!visit) return null;
  const topCandidate = (visit.topCandidate ?? {}) as Record<string, unknown>;
  const placeLocation = (topCandidate.placeLocation ?? {}) as Record<string, unknown>;
  const displayName =
    (topCandidate as { name?: string }).name ?? (visit as { name?: string }).name;
  if (!displayName) return null;
  const latLng = typeof placeLocation.latLng === 'string' ? placeLocation.latLng : undefined;
  let lat: number | undefined;
  let lng: number | undefined;
  if (latLng) {
    // Format: "25.0559910, 121.6098630" (may carry degree symbols)
    const m = latLng.match(/(-?\d+(?:\.\d+)?)\D+(-?\d+(?:\.\d+)?)/);
    if (m) {
      lat = parseFloat(m[1]);
      lng = parseFloat(m[2]);
    }
  }
  return {
    name: displayName,
    lat,
    lng,
    startTime: segment.startTime as string | undefined,
    endTime: segment.endTime as string | undefined,
  };
}

/** Parse a Google Maps Timeline export file into place visits. */
export function importGoogleMapsTimeline(text: string): PlaceVisit[] {
  const data = JSON.parse(text);
  const raw: RawVisit[] = [];

  if (Array.isArray(data.timelineObjects)) {
    for (const obj of data.timelineObjects) {
      if (obj.placeVisit) {
        const v = fromPlaceVisit(obj.placeVisit);
        if (v) raw.push(v);
      }
    }
  } else if (Array.isArray(data.semanticSegments)) {
    for (const seg of data.semanticSegments) {
      const v = fromSemanticSegment(seg);
      if (v) raw.push(v);
    }
  } else {
    throw new Error(
      'Unrecognized Google Maps Timeline export: expected "timelineObjects" or "semanticSegments".',
    );
  }

  return raw.map((v) => ({
    id: newId('place'),
    name: v.name ?? 'Unknown place',
    category: v.category ?? 'other',
    address: v.address,
    lat: v.lat,
    lng: v.lng,
    startTime: v.startTime,
    endTime: v.endTime,
    highlight: false,
    source: 'google-maps',
  }));
}
