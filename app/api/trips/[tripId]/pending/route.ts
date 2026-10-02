import { getStore } from '../../../../../lib/store';
import { editorOnly } from '../../../../../lib/auth/guard';
import { applyPending, discardPending, StageError } from '../../../../../lib/import/stage';

// Apply or discard the import waiting for review.
export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const denied = await editorOnly(req, tripId);
  if (denied) return denied;
  const { action } = ((await req.json().catch(() => ({}))) ?? {}) as { action?: string };
  try {
    if (action === 'apply') await applyPending(getStore(), tripId);
    else if (action === 'discard') await discardPending(getStore(), tripId);
    else return new Response('Apply or discard', { status: 400 });
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof StageError) return new Response(e.message, { status: 409 });
    throw e;
  }
}
