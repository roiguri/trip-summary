import { getStore } from '../../../lib/store';
import { actor, ownerOnly } from '../../../lib/auth/guard';
import { createTripFromPlan, StageError } from '../../../lib/import/stage';
import { PlanImportError } from '../../../lib/import/plan';
import { withUploadedFile } from '../../../lib/upload';

// A new trip from its Jarvis plan: it becomes a draft only editors can see.
export async function POST(req: Request) {
  const denied = await ownerOnly(req);
  if (denied) return denied;
  const form = await req.formData();
  const file = form.get('file');
  const tripId = form.get('tripId');
  if (!(file instanceof File) || typeof tripId !== 'string')
    return new Response('Choose a file and a trip', { status: 400 });
  try {
    const by = await actor();
    await withUploadedFile(file, (p) => createTripFromPlan(getStore(), p, tripId, by));
    return Response.json({ tripId });
  } catch (e) {
    if (e instanceof StageError || e instanceof PlanImportError)
      return new Response(e.message, { status: 409 });
    throw e;
  }
}
