import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getStore } from '../../../lib/store';
import { hashSecret, inviteCheck, inviteUid, newSecret } from '../../../lib/auth/access';
import {
  auth,
  cookieOptions,
  DEVICE_COOKIE,
  idTokenFor,
  SESSION_COOKIE,
  SESSION_DAYS,
  sessionCookieFor,
} from '../../../lib/auth/session';

// Opening a personal invite link: the first browser to open it is bound to it, and is signed in as
// that viewer. Any other browser is turned away, so a forwarded link gives nothing.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const problem = (reason: string) =>
    NextResponse.redirect(new URL(`/invite/problem?reason=${reason}`, req.url));
  const store = getStore();
  const jar = await cookies();
  const device = jar.get(DEVICE_COOKIE)?.value ?? newSecret();
  const deviceHash = hashSecret(device);

  let person = await store.findPersonByInvite(hashSecret(token));
  let check = inviteCheck(person, deviceHash);
  if (check !== 'ok' || !person) return problem(check);
  const trip = await store.getTrip(person.tripId);
  if (!trip) return problem('unknown');
  if (trip.status !== 'published') return problem('not-published');

  const uid = inviteUid(person.personId);
  if (!person.deviceHash) {
    // Bind only if still unbound: of two browsers opening the link at once, one wins.
    const bound = await store.updatePerson(
      person.personId,
      { deviceHash, uid },
      { deviceHash: null },
    );
    if (!bound) {
      person = await store.getPerson(person.personId);
      check = inviteCheck(person, deviceHash);
      if (check !== 'ok') return problem(check);
    }
  }
  await store.updatePerson(person!.personId, { lastOpenedAt: new Date().toISOString() });

  const session = await sessionCookieFor(await idTokenFor(await auth().createCustomToken(uid)));
  const res = NextResponse.redirect(new URL(`/trips/${encodeURIComponent(trip.tripId)}`, req.url));
  res.cookies.set(DEVICE_COOKIE, device, cookieOptions(400 * 86_400));
  res.cookies.set(SESSION_COOKIE, session, cookieOptions(SESSION_DAYS * 86_400));
  return res;
}
