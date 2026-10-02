import { getStore } from '../../../../../lib/store';
import { editorOnly } from '../../../../../lib/auth/guard';

// Publish a trip (viewers with a link can open it) or take it back to a draft.
export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const denied = await editorOnly(req, tripId);
  if (denied) return denied;
  const { status } = ((await req.json().catch(() => ({}))) ?? {}) as { status?: string };
  if (status !== 'published' && status !== 'draft')
    return new Response('Publish or draft', { status: 400 });
  const store = getStore();
  if (status === 'published' && !(await store.getJournal(tripId)))
    return new Response('Import the plan before publishing', { status: 409 });
  await store.setTripStatus(tripId, status);
  return new Response(null, { status: 204 });
}
