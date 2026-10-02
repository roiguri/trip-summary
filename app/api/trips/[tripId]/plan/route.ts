import { getStore } from '../../../../../lib/store';
import { actor, editorOnly } from '../../../../../lib/auth/guard';
import { StageError, stagePlan } from '../../../../../lib/import/stage';
import { withUploadedFile } from '../../../../../lib/upload';

// A newer Jarvis database for this trip: its plan waits for review.
export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const denied = await editorOnly(req, tripId);
  if (denied) return denied;
  const file = (await req.formData()).get('file');
  if (!(file instanceof File))
    return new Response('Choose your Jarvis database file', { status: 400 });
  try {
    const by = await actor();
    await withUploadedFile(file, (p) => stagePlan(getStore(), tripId, p, by));
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof StageError) return new Response(e.message, { status: 422 });
    throw e;
  }
}
