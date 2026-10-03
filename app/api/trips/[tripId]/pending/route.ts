import { getStore } from '../../../../../lib/store';
import { editorOnly } from '../../../../../lib/auth/guard';
import { applyPending, discardPending, StageError } from '../../../../../lib/import/stage';

const SOURCES = ['plan', 'timeline', 'photos'] as const;

// Apply or discard one waiting import.
export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const denied = await editorOnly(req, tripId);
  if (denied) return denied;
  const { action, source } = ((await req.json().catch(() => ({}))) ?? {}) as {
    action?: string;
    source?: string;
  };
  const src = SOURCES.find((s) => s === source);
  if (!src || (action !== 'apply' && action !== 'discard'))
    return new Response('Apply or discard a plan, Timeline or photo import', { status: 400 });
  try {
    if (action === 'apply') await applyPending(getStore(), tripId, src);
    else await discardPending(getStore(), tripId, src);
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof StageError) return new Response(e.message, { status: 409 });
    throw e;
  }
}
