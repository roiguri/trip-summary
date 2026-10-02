// An uploaded file, written to a private temporary file for the length of one request and removed
// after: the Jarvis database is read with SQLite, which needs a file. Nothing is kept between requests.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const MAX_DATABASE_BYTES = 20 * 1024 * 1024;

export async function withUploadedFile<T>(
  file: File,
  use: (path: string) => T | Promise<T>,
): Promise<T> {
  if (file.size > MAX_DATABASE_BYTES)
    throw new Error('That file is larger than a Jarvis database should be');
  const dir = await mkdtemp(path.join(tmpdir(), 'upload-'));
  const p = path.join(dir, 'travel.sqlite');
  try {
    await writeFile(p, Buffer.from(await file.arrayBuffer()), { mode: 0o600 });
    return await use(p);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
