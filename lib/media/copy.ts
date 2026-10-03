// Copying a picked photo or video into the trip's storage (docs/ARCHITECTURE.md, "Imports"). Photos
// come from Google already sized (2048px and 400px, agreed Oct 3: about fifty times less to download
// than originals), and are re-encoded with every bit of metadata, location included, removed. A
// video is kept as it is, with Google's thumbnail as its still. Without originals there is no EXIF
// offset: a photo's local time comes from the Timeline, else the destination's zone.
import sharp from 'sharp';
import type { PickedItem, Picker } from '../google/picker.ts';
import type { TripPhoto } from '../store/types.ts';
import { mediaPath } from './paths.ts';
import { saveFile } from './storage.ts';

const clean = (img: Buffer, size: number) =>
  sharp(img)
    .rotate()
    .resize(size, size, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();

export async function copyItem(
  tripId: string,
  item: PickedItem,
  picker: Picker,
): Promise<TripPhoto> {
  const video = item.type === 'VIDEO';
  const [large, small, movie] = await Promise.all([
    picker.fetchFile(item, '=w2048-h2048'),
    picker.fetchFile(item, '=w400-h400'),
    video ? picker.fetchFile(item, '=dv') : Promise.resolve(null),
  ]);
  const [display, thumb] = await Promise.all([clean(large, 2048), clean(small, 400)]);
  const files: TripPhoto['files'] = { thumb: mediaPath(tripId, item.id, 'thumb') };
  const main = video ? 'still' : 'display';
  files[main] = mediaPath(tripId, item.id, main);
  await Promise.all([
    saveFile(files[main]!, display, 'image/jpeg'),
    saveFile(files.thumb!, thumb, 'image/jpeg'),
    movie
      ? saveFile(
          (files.video = mediaPath(tripId, item.id, 'video')),
          movie,
          item.mediaFile.mimeType || 'video/mp4',
        )
      : null,
  ]);
  return {
    mediaId: item.id,
    kind: video ? 'video' : 'photo',
    takenUtc: item.createTime,
    offsetMin: null,
    offsetSource: null,
    width: item.mediaFile.mediaFileMetadata?.width ?? null,
    height: item.mediaFile.mediaFileMetadata?.height ?? null,
    mimeType: item.mediaFile.mimeType,
    filename: item.mediaFile.filename,
    files,
  };
}
