// A trip's card on the home page, from its journal: the cover (DESIGN.md, "Trip cover (K2)"), its
// photo and stop counts, and which sources it has.
import type { Trip as Model } from './model.ts';
import type { Edit, TripSummary } from './store/types.ts';

export function summarize(
  tripId: string,
  model: Model,
  edits: Edit[],
  sources: { hasTimeline: boolean; hasPhotos: boolean },
): TripSummary {
  const entries = model.days.flatMap((d) => d.entries);
  const photos = entries.flatMap((e) => e.photos);
  const stops = entries.filter(
    (e) => e.type === 'place' || (e.type === 'lodging' && e.stay?.role !== 'checkout'),
  );
  const pick = edits.find(
    (e) => e.target === 'trip' && e.key === tripId && e.field === 'cover',
  )?.value;
  const picked = typeof pick === 'string' ? photos.find((p) => p.id === pick && p.url) : undefined;
  if (picked)
    return {
      cover: picked.url,
      coverFrom: 'pick',
      photos: photos.length,
      stops: stops.length,
      ...sources,
    };
  // The stop with the most photos is usually the trip's high point; the earliest wins a tie.
  const best = stops
    .filter((e) => e.photos.some((p) => p.url))
    .reduce<(typeof stops)[number] | null>(
      (a, e) => (!a || e.photos.length > a.photos.length ? e : a),
      null,
    );
  const cover = best?.photos.find((p) => p.url)?.url ?? null;
  return {
    cover,
    coverFrom: cover ? 'stop' : null,
    photos: photos.length,
    stops: stops.length,
    ...sources,
  };
}
