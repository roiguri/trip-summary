// Files in the trip's Storage bucket (the emulator's in development and tests).
import { getStorage } from 'firebase-admin/storage';
import { adminApp } from '../firebase-admin.ts';

export const bucket = () => getStorage(adminApp()).bucket();

export async function saveFile(path: string, data: Buffer, contentType: string) {
  await bucket()
    .file(path)
    .save(data, {
      contentType,
      resumable: false,
      metadata: { cacheControl: 'private, max-age=31536000' },
    });
}

export async function deleteFolder(prefix: string) {
  await bucket().deleteFiles({ prefix });
}
