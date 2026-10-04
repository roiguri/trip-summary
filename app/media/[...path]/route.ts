import { Readable } from 'node:stream';
import { accessToTrip, currentAccount } from '../../../lib/auth/session';
import { tripOfPath } from '../../../lib/media/paths';
import { bucket } from '../../../lib/media/storage';

// A trip's stored photo or video, for someone who may see that trip (docs/ARCHITECTURE.md): Storage
// is closed to browsers, so every file comes through here. Supports range requests, so a video can
// be seeked without downloading all of it. A range is served at most CHUNK bytes at a time: hosts cap
// one response (Netlify at about 6 MB), and a video player asks again for the rest.
const CHUNK = 4 * 1024 * 1024;

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.map(decodeURIComponent).join('/');
  const tripId = tripOfPath(path);
  // A file you can't see and one that doesn't exist look the same.
  if (!tripId || !(await currentAccount()) || !(await accessToTrip(tripId)))
    return new Response('Not found', { status: 404 });
  const file = bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) return new Response('Not found', { status: 404 });
  const [meta] = await file.getMetadata();
  const size = Number(meta.size);
  const headers: Record<string, string> = {
    'Content-Type': String(meta.contentType ?? 'application/octet-stream'),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  };
  const range = req.headers.get('range')?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const last = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    const end = Math.min(last, start + CHUNK - 1);
    if (start > end || start >= size)
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    const body = Readable.toWeb(file.createReadStream({ start, end })) as ReadableStream;
    return new Response(body, {
      status: 206,
      headers: {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': String(end - start + 1),
      },
    });
  }
  const body = Readable.toWeb(file.createReadStream()) as ReadableStream;
  return new Response(body, { headers: { ...headers, 'Content-Length': String(size) } });
}
