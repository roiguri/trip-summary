import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '../../../../lib/auth/session';
import { sameOrigin } from '../../../../lib/auth/same-origin';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response('Forbidden', { status: 403 });
  (await cookies()).delete(SESSION_COOKIE);
  return new Response(null, { status: 204 });
}
