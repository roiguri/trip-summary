// The place window's server side (DESIGN.md, "Place window"): editors only, with the Google key kept
// on the server. Each route reads a small JSON body, checks it, and answers with what the window shows.
import 'server-only';
import { editorOnly } from './auth/guard.ts';
import { configuredPlaces, type PlaceSearch } from './google/places.ts';

const point = (b: Record<string, unknown>) =>
  typeof b.lat === 'number' &&
  typeof b.lng === 'number' &&
  Math.abs(b.lat) <= 90 &&
  Math.abs(b.lng) <= 180
    ? { lat: b.lat, lng: b.lng }
    : null;

/** Runs one place request for an editor of the trip: `answer` gets the checked body and the search. */
export async function placesRoute(
  req: Request,
  params: Promise<{ tripId: string }>,
  answer: (body: Record<string, unknown>, places: PlaceSearch) => Promise<unknown> | null,
) {
  const { tripId } = await params;
  const denied = await editorOnly(req, tripId);
  if (denied) return denied;
  const places = configuredPlaces();
  if (!places) return new Response('Place search isn’t set up on this site', { status: 503 });
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const work = answer(body, places);
  if (!work) return new Response('That request isn’t complete', { status: 400 });
  try {
    return Response.json(await work);
  } catch (e) {
    return new Response(e instanceof Error ? e.message : 'Google Places did not answer', {
      status: 502,
    });
  }
}

export const nearbyAnswer = (b: Record<string, unknown>, places: PlaceSearch) => {
  const at = point(b);
  return at ? places.nearby(at.lat, at.lng).then((list) => ({ places: list })) : null;
};

export const searchAnswer = (b: Record<string, unknown>, places: PlaceSearch) => {
  const at = point(b);
  const input = typeof b.input === 'string' ? b.input.trim().slice(0, 100) : '';
  return at && input
    ? places.search(input, at.lat, at.lng).then((list) => ({ predictions: list }))
    : null;
};

export const detailsAnswer = (b: Record<string, unknown>, places: PlaceSearch) =>
  typeof b.placeId === 'string' && b.placeId.length > 0 && b.placeId.length <= 300
    ? places.details(b.placeId).then((place) => ({ place }))
    : null;
