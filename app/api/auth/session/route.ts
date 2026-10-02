import { cookies } from 'next/headers';
import {
  cookieOptions,
  SESSION_COOKIE,
  SESSION_DAYS,
  sessionCookieFor,
} from '../../../../lib/auth/session';
import { sameOrigin } from '../../../../lib/auth/same-origin';

// Turns a fresh Google sign-in (an ID token from the sign-in page) into a session cookie.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response('Forbidden', { status: 403 });
  const { idToken } = (await req.json().catch(() => ({}))) as { idToken?: string };
  if (!idToken) return new Response('Missing sign-in', { status: 400 });
  try {
    const value = await sessionCookieFor(idToken);
    (await cookies()).set(SESSION_COOKIE, value, cookieOptions(SESSION_DAYS * 86_400));
    return new Response(null, { status: 204 });
  } catch {
    return new Response('That sign-in could not be verified. Try again.', { status: 401 });
  }
}
