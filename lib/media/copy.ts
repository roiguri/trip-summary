// Copying picked photos and videos into the trip's storage: one item per call, so a caller can work in
// small batches that each fit a short request (docs/ARCHITECTURE.md, "Imports"). Photos are kept at
// display (2048px) and thumbnail (400px) size with their metadata, location included, removed;
// videos as they are, with Google's thumbnail as their still.
import sharp from 'sharp';
import type { PickedItem, Picker } from '../google/picker.ts';
import type { TripPhoto } from '../store/types.ts';
import { exifOffset } from './exif.ts';
import { mediaPath } from './paths.ts';
import { saveFile } from './storage.ts';

const jpeg = (img: Buffer, size: number) =>
  sharp(img)
    .rotate()
    .resize(size, size, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

export async function copyItem(
  tripId: string,
  item: PickedItem,
  picker: Picker,
): Promise<TripPhoto> {
  const video = item.type === 'VIDEO';
  const files: TripPhoto['files'] = {};
  let offset: number | null = null;
  let image: Buffer;
  if (video) {
    const bytes = await picker.fetchFile(item, '=dv');
    files.video = mediaPath(tripId, item.id, 'video');
    await saveFile(files.video, bytes, item.mediaFile.mimeType || 'video/mp4');
    image = await picker.fetchFile(item, '=w2048-h2048');
  } else {
    image = await picker.fetchFile(item, '=d');
    offset = exifOffset(image);
  }
  const [display, thumb] = await Promise.all([jpeg(image, 2048), jpeg(image, 400)]);
  files[video ? 'still' : 'display'] = mediaPath(tripId, item.id, video ? 'still' : 'display');
  files.thumb = mediaPath(tripId, item.id, 'thumb');
  await Promise.all([
    saveFile(files[video ? 'still' : 'display']!, display, 'image/jpeg'),
    saveFile(files.thumb, thumb, 'image/jpeg'),
  ]);
  const meta = await sharp(display).metadata();
  return {
    mediaId: item.id,
    kind: video ? 'video' : 'photo',
    takenUtc: item.createTime,
    offsetMin: offset,
    offsetSource: offset === null ? null : 'exif',
    width: item.mediaFile.mediaFileMetadata?.width ?? meta.width ?? null,
    height: item.mediaFile.mediaFileMetadata?.height ?? meta.height ?? null,
    mimeType: item.mediaFile.mimeType,
    filename: item.mediaFile.filename,
    files,
  };
}
