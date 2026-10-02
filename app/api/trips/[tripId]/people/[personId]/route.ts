import { getStore } from '../../../../../../lib/store';
import { editorOnly } from '../../../../../../lib/auth/guard';
import { renewInvite, revokeInvite } from '../../../../../../lib/auth/invites';

// Revoke a viewer (their link stops working and their sessions end), or give them a new link.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ tripId: string; personId: string }> },
) {
  const { tripId, personId } = await params;
  const denied = await editorOnly(req, tripId);
  if (denied) return denied;
  const store = getStore();
  const person = await store.getPerson(personId);
  // Only a viewer of this very trip: an editor of one trip can't touch another trip's people.
  if (!person || person.tripId !== tripId || person.role !== 'viewer')
    return new Response('Not found', { status: 404 });
  const { action } = ((await req.json().catch(() => ({}))) ?? {}) as { action?: string };
  if (action === 'revoke') {
    await revokeInvite(store, personId);
    return new Response(null, { status: 204 });
  }
  if (action === 'renew') {
    const secret = await renewInvite(store, personId);
    return Response.json({ link: new URL(`/invite/${secret}`, req.url).toString() });
  }
  return new Response('Revoke or renew', { status: 400 });
}
