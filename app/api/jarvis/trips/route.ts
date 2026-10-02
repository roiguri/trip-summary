import { getStore } from '../../../../lib/store';
import { ownerOnly } from '../../../../lib/auth/guard';
import { listJarvisTrips, PlanImportError } from '../../../../lib/import/plan';
import { withUploadedFile } from '../../../../lib/upload';

// The trips in an uploaded Jarvis database, for choosing which one to add. The file is read and
// thrown away; the chosen trip's import sends it again.
export async function POST(req: Request) {
  const denied = await ownerOnly(req);
  if (denied) return denied;
  const file = (await req.formData()).get('file');
  if (!(file instanceof File))
    return new Response('Choose your Jarvis database file', { status: 400 });
  try {
    const trips = await withUploadedFile(file, listJarvisTrips);
    const store = getStore();
    const known = new Set((await store.listTrips()).map((t) => t.tripId));
    return Response.json(trips.map((t) => ({ ...t, added: known.has(t.tripId) })));
  } catch (e) {
    const message =
      e instanceof PlanImportError ? e.message : 'That file could not be read as a Jarvis database';
    return new Response(message, { status: 422 });
  }
}
