// Firebase sign-in tokens on the server. Separate from lib/auth/session.ts (which reads the request's
// cookies) so tests can use them directly.
import { getAuth } from 'firebase-admin/auth';
import { adminApp, emulated } from '../firebase-admin.ts';

export const SESSION_DAYS = 14;
export const auth = () => getAuth(adminApp());

/** The owner's email, from the server's settings; on the emulators a mock owner stands in. */
export const ownerEmail = () =>
  process.env.OWNER_EMAIL ?? (emulated() ? 'owner@example.com' : undefined);

/** Turns a custom token into an ID token, as a browser would (Identity Toolkit), so an invite link
 *  can be turned into a session without any script running in the viewer's browser. */
export async function idTokenFor(customToken: string) {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const base =
    host && emulated()
      ? `http://${host}/identitytoolkit.googleapis.com`
      : 'https://identitytoolkit.googleapis.com';
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'emulator';
  const r = await fetch(`${base}/v1/accounts:signInWithCustomToken?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  if (!r.ok) throw new Error(`Sign-in with the invite failed (${r.status})`);
  return ((await r.json()) as { idToken: string }).idToken;
}

/** A session cookie for a fresh ID token. Firebase refuses tokens signed in more than 5 minutes ago. */
export async function sessionCookieFor(idToken: string) {
  const decoded = await auth().verifyIdToken(idToken, true);
  if (Date.now() / 1000 - decoded.auth_time > 5 * 60)
    throw new Error('Sign in again: that sign-in is too old');
  return auth().createSessionCookie(idToken, { expiresIn: SESSION_DAYS * 86_400_000 });
}
