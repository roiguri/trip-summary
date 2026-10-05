// Place names from Google's Places API (New), by the place ID the Timeline gives each visit
// (docs/ROADMAP.md, "Google Places API"). Looked up once per place and cached in the store, so a
// trip costs a few hundred lookups once, within Google's free monthly allowance. Server only: the
// key (GOOGLE_PLACES_KEY) never reaches a browser.
import { emulated } from '../firebase-admin.ts';
import type { Store } from '../store/index.ts';

/** A place's name, or null when Google has none for that ID; throws on other failures. */
export type NameLookup = (placeId: string) => Promise<string | null>;

export function googlePlaceNames(key: string): NameLookup {
  return async (placeId) => {
    const r = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en`,
      { headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'displayName' } },
    );
    if (r.status === 404 || r.status === 400) return null;
    if (!r.ok) throw new Error(`Google Places answered ${r.status}`);
    const body = (await r.json()) as { displayName?: { text?: string } };
    return body.displayName?.text?.trim() || null;
  };
}

/** The configured name lookup: Google's with a key; on the emulators mock places are named by the
 *  mock (any others by Google when there's a key); otherwise none. */
export function configuredLookup(): NameLookup | null {
  const key = process.env.GOOGLE_PLACES_KEY;
  const google = key ? googlePlaceNames(key) : null;
  if (!emulated()) return google;
  return async (placeId) =>
    placeId.startsWith('mock:') ? mockPlaceNames(placeId) : google ? google(placeId) : null;
}

/** The configured place search: the mock on the emulators (development, tests); Google's with a
 *  key; otherwise none (the place window says so). */
export const configuredPlaces = (): PlaceSearch | null =>
  emulated()
    ? mockPlaces()
    : process.env.GOOGLE_PLACES_KEY
      ? googlePlaces(process.env.GOOGLE_PLACES_KEY)
      : null;

/** Names for these place IDs: cached ones, plus up to `max` looked up now (a few at a time) and
 *  cached; the rest wait for the next call, so one page view stays short. */
export async function placeNames(
  store: Store,
  ids: string[],
  lookup: NameLookup | null,
  max = 60,
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const cached = await store.getPlaceNames(unique);
  const names = new Map<string, string>();
  for (const [id, name] of cached) if (name) names.set(id, name);
  if (!lookup) return names;
  const missing = unique.filter((id) => !cached.has(id)).slice(0, max);
  for (let i = 0; i < missing.length; i += 8) {
    const batch = missing.slice(i, i + 8);
    const found = await Promise.allSettled(batch.map((id) => lookup(id)));
    const fresh = new Map<string, string | null>();
    found.forEach((f, n) => {
      // A failure (quota, network) isn't cached: it's tried again next time.
      if (f.status === 'fulfilled') fresh.set(batch[n], f.value);
    });
    if (fresh.size) await store.putPlaceNames(fresh);
    for (const [id, name] of fresh) if (name) names.set(id, name);
  }
  return names;
}

// --- Choosing a place (DESIGN.md, "Place window") -----------------------------------------------------

/** A place to choose: Google's, or (manual pin) none. `type` is humanised for display. */
export type PlaceChoice = { id: string; name: string; type: string; lat: number; lng: number };
/** A search suggestion; choosing it fetches the place by ID. */
export type PlacePrediction = { placeId: string; main: string; secondary: string };

export type PlaceSearch = {
  nearby(lat: number, lng: number): Promise<PlaceChoice[]>;
  search(input: string, lat: number, lng: number): Promise<PlacePrediction[]>;
  details(placeId: string): Promise<PlaceChoice | null>;
};

/** "tourist_attraction" → "tourist attraction". */
const humanise = (type: string | undefined) => (type ?? 'place').replaceAll('_', ' ');

type GooglePlace = {
  id: string;
  displayName?: { text?: string };
  location?: { latitude: number; longitude: number };
  primaryType?: string;
};
const toChoice = (p: GooglePlace): PlaceChoice | null =>
  p.location
    ? {
        id: p.id,
        name: p.displayName?.text?.trim() || 'A place',
        type: humanise(p.primaryType),
        lat: p.location.latitude,
        lng: p.location.longitude,
      }
    : null;

/** Places API (New): Nearby Search (around where the owner was), Autocomplete (biased to the area)
 *  and Place Details, each asking only for the fields shown. */
export function googlePlaces(key: string): PlaceSearch {
  const API = 'https://places.googleapis.com/v1';
  const call = async (url: string, init: RequestInit, fields?: string) => {
    const r = await fetch(url, {
      ...init,
      headers: {
        'X-Goog-Api-Key': key,
        'Content-Type': 'application/json',
        ...(fields ? { 'X-Goog-FieldMask': fields } : {}),
      },
    });
    if (!r.ok) throw new Error(`Google Places answered ${r.status}`);
    return r.json();
  };
  return {
    async nearby(lat, lng) {
      const body = (await call(
        `${API}/places:searchNearby`,
        {
          method: 'POST',
          body: JSON.stringify({
            maxResultCount: 15,
            rankPreference: 'DISTANCE',
            languageCode: 'en',
            locationRestriction: {
              circle: { center: { latitude: lat, longitude: lng }, radius: 250 },
            },
          }),
        },
        'places.id,places.displayName,places.location,places.primaryType',
      )) as { places?: GooglePlace[] };
      return (body.places ?? []).flatMap((p) => toChoice(p) ?? []);
    },
    async search(input, lat, lng) {
      const body = (await call(`${API}/places:autocomplete`, {
        method: 'POST',
        body: JSON.stringify({
          input,
          languageCode: 'en',
          locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 3000 } },
        }),
      })) as {
        suggestions?: {
          placePrediction?: {
            placeId: string;
            structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
            text?: { text?: string };
          };
        }[];
      };
      return (body.suggestions ?? []).flatMap((s) =>
        s.placePrediction
          ? [
              {
                placeId: s.placePrediction.placeId,
                main:
                  s.placePrediction.structuredFormat?.mainText?.text ??
                  s.placePrediction.text?.text ??
                  '',
                secondary: s.placePrediction.structuredFormat?.secondaryText?.text ?? '',
              },
            ]
          : [],
      );
    },
    async details(placeId) {
      try {
        return toChoice(
          (await call(
            `${API}/places/${encodeURIComponent(placeId)}?languageCode=en`,
            { method: 'GET' },
            'id,displayName,location,primaryType',
          )) as GooglePlace,
        );
      } catch (e) {
        if (/ (400|404)$/.test(String((e as Error).message))) return null;
        throw e;
      }
    },
  };
}

// The mock, for development and tests: a few made-up places around the point, their IDs carrying
// where they are (`mock:<lat>:<lng>:<n>`), so details and names need no state.
const MOCK = [
  ['Harbour Lookout', 'tourist attraction', 0.0002, 0.0001],
  ['Corner Café', 'cafe', -0.0003, 0.0002],
  ['Old Temple', 'place of worship', 0.0005, -0.0004],
  ['Night Market', 'market', -0.0008, -0.0006],
  ['Station Square', 'transit station', 0.001, 0.0009],
] as const;
const mockId = (lat: number, lng: number, n: number) =>
  `mock:${lat.toFixed(6)}:${lng.toFixed(6)}:${n}`;
const fromMockId = (id: string): PlaceChoice | null => {
  const m = id.match(/^mock:(-?[\d.]+):(-?[\d.]+):(\d)$/);
  const spec = m && MOCK[Number(m[3])];
  return m && spec
    ? { id, name: spec[0], type: spec[1], lat: Number(m[1]), lng: Number(m[2]) }
    : null;
};

export function mockPlaces(): PlaceSearch {
  const around = (lat: number, lng: number) =>
    MOCK.map(([, , dLat, dLng], n) => fromMockId(mockId(lat + dLat, lng + dLng, n))!);
  return {
    async nearby(lat, lng) {
      return around(lat, lng);
    },
    async search(input, lat, lng) {
      const q = input.trim().toLowerCase();
      return around(lat, lng)
        .filter((p) => p.name.toLowerCase().includes(q))
        .map((p) => ({ placeId: p.id, main: p.name, secondary: p.type }));
    },
    async details(placeId) {
      return fromMockId(placeId);
    },
  };
}

/** The mock's names, so a chosen mock place is named like a real one (development and tests). */
export const mockPlaceNames: NameLookup = async (placeId) => fromMockId(placeId)?.name ?? null;
