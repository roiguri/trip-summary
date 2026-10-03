import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { accessToTrip, cookieOptions } from '../../../../../lib/auth/session';
import { CALLBACK, googleClient, STATE_COOKIE } from '../../../../../lib/google/oauth';
import { PHOTOS_COOKIE, sealToken, unseal } from '../../../../../lib/google/token-cookie';

// Google's answer to the photos consent: the code becomes an access token (about an hour), kept only
// in an encrypted HTTP-only cookie.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const saved = unseal<{ state: string; verifier: string; trip: string }>(
    jar.get(STATE_COOKIE)?.value,
  );
  jar.delete(STATE_COOKIE);
  if (!saved || url.searchParams.get('state') !== saved.state)
    return new Response('That request to Google expired. Try again.', { status: 400 });
  const back = new URL(`/trips/${encodeURIComponent(saved.trip)}/sources`, req.url);
  if (url.searchParams.get('error') || !url.searchParams.get('code')) {
    back.searchParams.set('photos', 'declined');
    return NextResponse.redirect(back);
  }
  if ((await accessToTrip(saved.trip))?.access !== 'edit')
    return new Response('Not found', { status: 404 });
  const client = googleClient()!;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      code: url.searchParams.get('code')!,
      client_id: client.id,
      client_secret: client.secret,
      redirect_uri: new URL(CALLBACK, req.url).toString(),
      grant_type: 'authorization_code',
      code_verifier: saved.verifier,
    }),
  });
  const token = (await r.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!r.ok || !token.access_token) {
    back.searchParams.set('photos', 'failed');
    return NextResponse.redirect(back);
  }
  const life = Math.max(60, (token.expires_in ?? 3600) - 60);
  const res = NextResponse.redirect(back);
  res.cookies.set(
    PHOTOS_COOKIE,
    sealToken(token.access_token, Date.now() + life * 1000),
    cookieOptions(life),
  );
  return res;
}
