// Where a trip's media lives in Storage, and the app URL that serves it (app/media/[...path]): Storage
// itself is closed to browsers, so every file goes through an access check.

export type MediaFile = 'display' | 'thumb' | 'video' | 'still';
const NAMES: Record<MediaFile, string> = {
  display: 'display.jpg',
  thumb: 'thumb.jpg',
  video: 'video.mp4',
  still: 'still.jpg',
};

export const mediaPath = (tripId: string, mediaId: string, file: MediaFile) =>
  `trips/${tripId}/media/${mediaId}/${NAMES[file]}`;

/** The trip a media path belongs to, or null for anything that isn't one. */
export function tripOfPath(path: string) {
  const m = path.match(
    /^trips\/([^/]+)\/media\/[^/]+\/(display\.jpg|thumb\.jpg|video\.mp4|still\.jpg)$/,
  );
  return m ? m[1] : null;
}

/** What a page uses to show a stored file. Paths already on the web (the sample's own pictures)
 *  are used as they are. */
export const mediaUrl = (path: string) =>
  path.startsWith('/') || /^https?:\/\//.test(path)
    ? path
    : `/media/${path.split('/').map(encodeURIComponent).join('/')}`;
