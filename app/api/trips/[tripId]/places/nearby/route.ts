import { nearbyAnswer, placesRoute } from '../../../../../../lib/places-route';

// The place window: Google's places around a point (lib/places-route.ts).
export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  return placesRoute(req, params, nearbyAnswer);
}
