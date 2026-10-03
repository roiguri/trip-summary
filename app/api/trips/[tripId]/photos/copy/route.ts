import { getStore } from '../../../../../../lib/store';
import { actor, editorOnly } from '../../../../../../lib/auth/guard';
import { pickerFor } from '../../../../../../lib/google/choose';
import { copyItem } from '../../../../../../lib/media/copy';
import { addPendingPhotos, beginPhotos, StageError } from '../../../../../../lib/import/stage';

/** A few photos, or one video, per request: each fits a short function's time limit. */
const PHOTOS_PER_CALL = 4;

// Copies the next few picked items into the trip's storage and adds them to the waiting photo
// import; the page calls it until nothing is left, then shows the review.
export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const denied = await editorOnly(req, tripId);
  if (denied) return denied;
  const { sessionId } = ((await req.json().catch(() => ({}))) ?? {}) as { sessionId?: string };
  const picker = await pickerFor(sessionId);
  if (!picker || !sessionId) return new Response('Connect Google Photos first', { status: 401 });
  const store = getStore();
  try {
    let pending = await store.getPending(tripId);
    if (pending?.source !== 'photos' || pending.sessionId !== sessionId) {
      await beginPhotos(store, tripId, sessionId, await actor());
      pending = await store.getPending(tripId);
    }
    if (pending?.source !== 'photos') throw new StageError('The photo import was replaced');
    // Photos already in the trip are skipped: a re-pick never duplicates.
    const inTrip = new Set((await store.listPhotos(tripId)).map((p) => p.mediaId));
    const inImport = new Set(pending.photos.map((p) => p.mediaId));
    const items = await picker.listItems(sessionId);
    const wanted = items.filter((i) => !inTrip.has(i.id));
    const todo = wanted.filter((i) => !inImport.has(i.id));
    const batch =
      todo[0]?.type === 'VIDEO'
        ? todo.slice(0, 1)
        : todo.slice(0, PHOTOS_PER_CALL).filter((i) => i.type === 'PHOTO');
    const copied = [];
    for (const item of batch) copied.push(await copyItem(tripId, item, picker));
    if (copied.length) await addPendingPhotos(store, tripId, copied);
    const remaining = todo.length - copied.length;
    if (!remaining) await picker.deleteSession(sessionId);
    // `total` stays the same from call to call, so the page can show steady progress.
    return Response.json({
      total: wanted.length,
      done: wanted.length - remaining,
      alreadyInTrip: items.length - wanted.length,
      remaining,
    });
  } catch (e) {
    if (e instanceof StageError) return new Response(e.message, { status: 409 });
    throw e;
  }
}
