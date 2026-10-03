import { NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { accessToTrip } from '../../../../lib/auth/session';
import { cookieOptions } from '../../../../lib/auth/session';
import { CALLBACK, googleClient, PICKER_SCOPE, STATE_COOKIE } from '../../../../lib/google/oauth';
import { seal } from '../../../../lib/google/token-cookie';

// Sends an editor to Google to allow reading the photos they pick, for one trip's import page.
export async function GET(req: Request) {
  const trip = new URL(req.url).searchParams.get('trip') ?? '';
  if ((await accessToTrip(trip))?.access !== 'edit')
    return new Response('Not found', { status: 404 });
  const client = googleClient();
  if (!client)
    return new Response('Google Photos is not set up on this server (GOOGLE_CLIENT_ID)', {
      status: 503,
    });
  const state = randomBytes(16).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: client.id,
    redirect_uri: new URL(CALLBACK, req.url).toString(),
    response_type: 'code',
    scope: PICKER_SCOPE,
    access_type: 'online',
    include_granted_scopes: 'false',
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  }).toString();
  const res = NextResponse.redirect(url);
  // Lax, so the cookie comes back on Google's redirect to the callback.
  res.cookies.set(
    STATE_COOKIE,
    seal({ state, verifier, trip }, Date.now() + 10 * 60_000),
    cookieOptions(10 * 60),
  );
  return res;
}
