import { getStore } from '../../../../../../lib/store';
import { editorOnly } from '../../../../../../lib/auth/guard';
import { pickerFor } from '../../../../../../lib/google/choose';
import { copyNextPhotos, StageError } from '../../../../../../lib/import/stage';

// Copies the next few picked items, in parallel; the page's background copier calls it until none
// are left. Each call is short, so it fits any host's time limit.
export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const denied = await editorOnly(req, tripId);
  if (denied) return denied;
  const store = getStore();
  const pending = await store.getPending(tripId, 'photos');
  if (!pending) return new Response('There is no photo import copying', { status: 404 });
  const picker = await pickerFor(pending.sessionId);
  if (!picker)
    return new Response('The Google Photos connection expired: connect again to continue', {
      status: 401,
    });
  try {
    return Response.json(await copyNextPhotos(store, tripId, picker));
  } catch (e) {
    if (e instanceof StageError)
      return new Response(e.message, /expired/.test(e.message) ? { status: 401 } : { status: 409 });
    throw e;
  }
}
