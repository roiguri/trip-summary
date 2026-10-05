import { detailsAnswer, placesRoute } from '../../../../../../lib/places-route';

// The place window: one place by its Google ID (lib/places-route.ts).
export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  return placesRoute(req, params, detailsAnswer);
}
