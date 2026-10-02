import { getStore } from '../../../../../lib/store';
import { actor, editorOnly } from '../../../../../lib/auth/guard';
import { StageError, stageTimeline } from '../../../../../lib/import/stage';
import type { TimelineSegment } from '../../../../../lib/store/types';

// The trip's slice of the Timeline, made in the browser: it waits for review.
export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const denied = await editorOnly(req, tripId);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as { segments?: TimelineSegment[] } | null;
  if (!Array.isArray(body?.segments))
    return new Response('Missing the Timeline slice', { status: 400 });
  try {
    await stageTimeline(getStore(), tripId, body.segments, await actor());
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof StageError) return new Response(e.message, { status: 422 });
    throw e;
  }
}
