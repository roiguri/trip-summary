import { editorOnly } from '../../../../../../lib/auth/guard';
import { MOCK_SESSION, pickerFor } from '../../../../../../lib/google/choose';

// A Google Photos Picker session: the page opens its picker for the owner to choose photos.
export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const denied = await editorOnly(req, tripId);
  if (denied) return denied;
  const { mock } = ((await req.json().catch(() => ({}))) ?? {}) as { mock?: boolean };
  const picker = await pickerFor(mock ? MOCK_SESSION : undefined);
  if (!picker) return new Response('Connect Google Photos first', { status: 401 });
  try {
    const s = await picker.createSession();
    return Response.json({ sessionId: s.id, pickerUri: s.pickerUri, expireTime: s.expireTime });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : 'Google Photos did not answer', {
      status: 502,
    });
  }
}
