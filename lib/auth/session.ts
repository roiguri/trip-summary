// The data access layer for sign-in (Next's authentication guide): every page and route that shows
// or changes a trip asks here first. Sessions are Firebase session cookies, verified on every request
// with revocation checked, so revoking an invite ends its sessions at once.
import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { auth, ownerEmail } from './tokens.ts';
import { getStore } from '../store/index.ts';
import type { Trip } from '../store/types.ts';
import { accessTo, isOwner, type Access, type Account } from './access.ts';

export const SESSION_COOKIE = '__session';
export const DEVICE_COOKIE = 'ts_device';
export { SESSION_DAYS } from './tokens.ts';

export { auth, idTokenFor, ownerEmail, sessionCookieFor } from './tokens.ts';

/** Cookie settings for both cookies: never readable by page scripts, HTTPS only (browsers accept
 *  Secure cookies on localhost), and not sent on cross-site requests. */
export const cookieOptions = (maxAgeSeconds: number) => ({
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: maxAgeSeconds,
});

/** The signed-in account, or null. Verified once per request. */
export const currentAccount = cache(async (): Promise<Account | null> => {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return null;
  try {
    const t = await auth().verifySessionCookie(value, true);
    return { uid: t.uid, email: t.email ?? null, name: (t.name as string | undefined) ?? null };
  } catch {
    return null;
  }
});

/** What the signed-in account may do with a trip, or null (also for a trip that doesn't exist). */
export const accessToTrip = cache(
  async (tripId: string): Promise<{ trip: Trip; access: Access } | null> => {
    const account = await currentAccount();
    if (!account) return null;
    const store = getStore();
    const trip = await store.getTrip(tripId);
    if (!trip) return null;
    const access = accessTo(
      trip,
      account,
      await store.peopleFor(account.uid, account.email),
      ownerEmail(),
    );
    return access ? { trip, access } : null;
  },
);

/** The trips the signed-in account may see, newest first. */
export const visibleTrips = cache(async (): Promise<{ trip: Trip; access: Access }[]> => {
  const account = await currentAccount();
  if (!account) return [];
  const store = getStore();
  const [trips, people] = await Promise.all([
    store.listTrips(),
    store.peopleFor(account.uid, account.email),
  ]);
  return trips.flatMap((trip) => {
    const access = accessTo(trip, account, people, ownerEmail());
    return access ? [{ trip, access }] : [];
  });
});

export const canCreateTrips = async () => {
  const a = await currentAccount();
  return !!a && isOwner(a, ownerEmail());
};
