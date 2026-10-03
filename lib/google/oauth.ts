// The Google consent for reading the photos the owner picks (scope photospicker.mediaitems.readonly).
// Separate from signing in; asks for no refresh token, so nothing long-lived exists anywhere.
export const PICKER_SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';
export const STATE_COOKIE = 'ts_gphotos_state';
export const CALLBACK = '/api/auth/callback/google';

export function googleClient() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}
