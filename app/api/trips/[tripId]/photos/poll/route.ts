import { editorOnly } from '../../../../../../lib/auth/guard';
import { pickerFor } from '../../../../../../lib/google/choose';

// Whether the owner has finished picking.
export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const denied = await editorOnly(req, tripId);
  if (denied) return denied;
  const { sessionId } = ((await req.json().catch(() => ({}))) ?? {}) as { sessionId?: string };
  const picker = await pickerFor(sessionId);
  if (!picker || !sessionId) return new Response('Connect Google Photos first', { status: 401 });
  return Response.json({ done: await picker.isDone(sessionId) });
}
