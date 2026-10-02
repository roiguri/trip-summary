import { getStore } from '../../../../../lib/store';
import { actor, editorOnly } from '../../../../../lib/auth/guard';
import { createInvite } from '../../../../../lib/auth/invites';

// A new viewer: their personal link is returned once, to copy and send; only its hash is kept.
export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const denied = await editorOnly(req, tripId);
  if (denied) return denied;
  const { name } = ((await req.json().catch(() => ({}))) ?? {}) as { name?: string };
  const clean = name?.trim().slice(0, 60);
  if (!clean)
    return new Response('Give them a name, so you know whose link it is', { status: 400 });
  const { secret, person } = await createInvite(getStore(), tripId, clean, await actor());
  return Response.json({
    personId: person.personId,
    link: new URL(`/invite/${secret}`, req.url).toString(),
  });
}
