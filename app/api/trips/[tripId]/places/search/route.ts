import { searchAnswer, placesRoute } from '../../../../../../lib/places-route';

// The place window: places matching what the owner types, near a point (lib/places-route.ts).
export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  return placesRoute(req, params, searchAnswer);
}
