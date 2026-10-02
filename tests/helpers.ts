// Shared by the unit and store tests.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** A fresh database file built from SQL, as Jarvis would have it on disk. */
export function jarvisFile(sql = readFileSync('data/mock/jarvis.sql', 'utf8')) {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'jarvis-')), 'travel.sqlite');
  const db = new DatabaseSync(file);
  db.exec(sql);
  db.close();
  return file;
}

/** The mock Picker results as the photo import would store them (files stand in for the copies). */
export function mockPhotos(): import('../lib/store/types.ts').TripPhoto[] {
  const picker = JSON.parse(readFileSync('data/mock/picker.json', 'utf8'));
  const files = JSON.parse(readFileSync('data/mock/picker-files.json', 'utf8'));
  return picker.mediaItems.map((m: any) => {
    const f = files[m.id];
    const off = f.exifOffset?.match(/^([+-])(\d\d):(\d\d)$/);
    return {
      mediaId: m.id,
      kind: m.type === 'VIDEO' ? 'video' : 'photo',
      takenUtc: m.createTime,
      offsetMin: off ? (off[1] === '-' ? -1 : 1) * (Number(off[2]) * 60 + Number(off[3])) : null,
      offsetSource: off ? 'exif' : null,
      width: m.mediaFile.mediaFileMetadata.width,
      height: m.mediaFile.mediaFileMetadata.height,
      mimeType: m.mediaFile.mimeType,
      filename: m.mediaFile.filename,
      files: f.file ? { display: f.file, thumb: f.file } : {},
    };
  });
}

/** The mock edits (data/mock/edits.json) as stored edits. */
export function mockEdits(tripId: string): import('../lib/store/types.ts').Edit[] {
  const e = JSON.parse(readFileSync('data/mock/edits.json', 'utf8'));
  const ids = JSON.parse(readFileSync('data/mock/expected.json', 'utf8')).entryIds;
  const at = '2026-10-02T00:00:00.000Z';
  const by = 'editor@example.com';
  return [
    { target: 'trip', key: tripId, field: 'subtitle', value: e.trip.subtitle, at, by },
    ...Object.entries(e.dayTitles).map(([date, value]) => ({
      target: 'day' as const,
      key: date,
      field: 'title',
      value: value as string,
      at,
      by,
    })),
    ...Object.entries(e.photoCaptions).map(([id, value]) => ({
      target: 'photo' as const,
      key: id,
      field: 'caption',
      value: value as string,
      at,
      by,
    })),
    ...Object.entries(e.photoEntries).map(([id, entry]) => ({
      target: 'photo' as const,
      key: id,
      field: 'entry',
      value: String(ids[entry as string]),
      at,
      by,
    })),
  ];
}
