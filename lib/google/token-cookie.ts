// The Google Photos access token, kept only in an encrypted HTTP-only cookie for its short life
// (about an hour; no refresh token is ever asked for). AES-256-GCM with a server key, so the browser
// can neither read nor alter it.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { emulated } from '../firebase-admin.ts';

export const PHOTOS_COOKIE = 'ts_gphotos';

/** The server key (PHOTOS_TOKEN_KEY, 32 bytes in base64); a fixed one on the emulators only. */
function key() {
  const k = process.env.PHOTOS_TOKEN_KEY;
  if (k) return Buffer.from(k, 'base64');
  if (emulated()) return createHash('sha256').update('trip-summary development key').digest();
  throw new Error('PHOTOS_TOKEN_KEY is not set');
}

export function sealToken(token: string, expiresAt: number, k = key()) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', k, iv);
  const body = Buffer.concat([c.update(JSON.stringify({ token, expiresAt }), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url');
}

/** The token, or null if the cookie is missing, altered, from another key, or expired. */
export function openToken(sealed: string | undefined, k = key(), now = Date.now()): string | null {
  if (!sealed) return null;
  try {
    const raw = Buffer.from(sealed, 'base64url');
    const d = createDecipheriv('aes-256-gcm', k, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    const { token, expiresAt } = JSON.parse(
      Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8'),
    );
    return expiresAt > now ? token : null;
  } catch {
    return null;
  }
}

/** Seals any small value the same way (the sign-in's state and PKCE verifier on its way to Google). */
export function seal(value: object, expiresAt: number, k = key()) {
  return sealToken(JSON.stringify(value), expiresAt, k);
}
export function unseal<T>(sealed: string | undefined, k = key(), now = Date.now()): T | null {
  const raw = openToken(sealed, k, now);
  try {
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}
