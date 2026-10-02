import { NextResponse } from 'next/server';
import { emulated } from '../../../../lib/firebase-admin';
import { getStore } from '../../../../lib/store';
import { safeNext } from '../../../../lib/auth/access';
import { createInvite } from '../../../../lib/auth/invites';
import {
  auth,
  cookieOptions,
  idTokenFor,
  ownerEmail,
  SESSION_COOKIE,
  SESSION_DAYS,
  sessionCookieFor,
} from '../../../../lib/auth/session';

// Development and tests only: sign in as the mock editor, or open a fresh invite as a mock viewer.
// It exists only on the emulators with the demo project, so it can never sign anyone into a real one.
//   /api/auth/dev?as=editor&next=/trips/sample-coast
//   /api/auth/dev?as=viewer&trip=sample-coast
//   /api/auth/dev?as=guest   (a Google account that is on no trip)
export async function GET(req: Request) {
  if (!emulated()) return new Response('Not found', { status: 404 });
  const url = new URL(req.url);
  if (url.searchParams.get('as') === 'viewer') {
    const trip = url.searchParams.get('trip');
    if (!trip) return new Response('Missing trip', { status: 400 });
    const { secret } = await createInvite(getStore(), trip, 'Mock viewer', 'dev');
    return NextResponse.redirect(new URL(`/invite/${secret}`, req.url));
  }
  const guest = url.searchParams.get('as') === 'guest';
  const uid = guest ? 'dev-guest' : 'dev-editor';
  const email = guest ? 'guest@example.com' : ownerEmail()!;
  const displayName = guest ? 'Mock guest' : 'Mock editor';
  await auth()
    .updateUser(uid, { email, displayName })
    .catch(() => auth().createUser({ uid, email, displayName }));
  const session = await sessionCookieFor(await idTokenFor(await auth().createCustomToken(uid)));
  const res = NextResponse.redirect(new URL(safeNext(url.searchParams.get('next')), req.url));
  res.cookies.set(SESSION_COOKIE, session, cookieOptions(SESSION_DAYS * 86_400));
  return res;
}
