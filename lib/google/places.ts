// Place names from Google's Places API (New), by the place ID the Timeline gives each visit
// (docs/ROADMAP.md, "Google Places API"). Looked up once per place and cached in the store, so a
// trip costs a few hundred lookups once, within Google's free monthly allowance. Server only: the
// key (GOOGLE_PLACES_KEY) never reaches a browser.
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

/** The configured lookup, or none (no key: development, tests). */
export const configuredLookup = (): NameLookup | null =>
  process.env.GOOGLE_PLACES_KEY ? googlePlaceNames(process.env.GOOGLE_PLACES_KEY) : null;

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
