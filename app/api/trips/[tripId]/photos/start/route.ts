import { getStore } from '../../../../../../lib/store';
import { actor, editorOnly } from '../../../../../../lib/auth/guard';
import { pickerFor } from '../../../../../../lib/google/choose';
import { beginPhotos, StageError } from '../../../../../../lib/import/stage';

// The owner finished picking: the picked items are listed once and kept, and the copy job starts.
export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const denied = await editorOnly(req, tripId);
  if (denied) return denied;
  const { sessionId } = ((await req.json().catch(() => ({}))) ?? {}) as { sessionId?: string };
  const picker = await pickerFor(sessionId);
  if (!picker || !sessionId) return new Response('Connect Google Photos first', { status: 401 });
  try {
    const items = await picker.listItems(sessionId);
    const { pending } = await beginPhotos(getStore(), tripId, sessionId, items, await actor());
    return Response.json({
      total: pending.source === 'photos' ? pending.total : 0,
      picked: items.length,
    });
  } catch (e) {
    if (e instanceof StageError) return new Response(e.message, { status: 409 });
    return new Response(e instanceof Error ? e.message : 'Google Photos did not answer', {
      status: 502,
    });
  }
}
