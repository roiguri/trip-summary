// Which picker a request uses: Google's with the editor's token, or (on the emulators only) the mock.
import 'server-only';
import { cookies } from 'next/headers';
import { emulated } from '../firebase-admin.ts';
import { googlePicker, mockPicker, type Picker } from './picker.ts';
import { openToken, PHOTOS_COOKIE } from './token-cookie.ts';

export const MOCK_SESSION = 'mock';

export async function pickerFor(sessionId: string | undefined): Promise<Picker | null> {
  if (sessionId === MOCK_SESSION) return emulated() ? mockPicker() : null;
  const token = openToken((await cookies()).get(PHOTOS_COOKIE)?.value);
  return token ? googlePicker(token) : null;
}

export const photosConnected = async () => !!openToken((await cookies()).get(PHOTOS_COOKIE)?.value);
