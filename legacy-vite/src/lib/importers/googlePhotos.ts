/**
 * Importer: Google Photos.
 *
 * There is no client-side-only way to read a Google Photos album directly
 * (the Photos Library API requires OAuth, which needs a backend/client
 * config). So this importer works from an EXPORT:
 *
 *   Option A - Google Takeout: each photo ships with a
 *     "<filename>.json" metadata sidecar containing photoTakenTime.
 *
 *   Option B - a hand-made JSON array (documented in the README):
 *     [ { "fileName": "IMG_1234.jpg", "takenAt": "2026-09-25T10:32:00Z", "description": "..." } ]
 *
 * This importer accepts EITHER a single sidecar/JSON file or an array in
 * Option-B shape and returns PhotoRefs to be grouped by day.
 *
 * TODO(future): add an optional OAuth flow so a shared album link can be
 * imported directly, and store thumbnails in IndexedDB instead of URLs.
 */
import { PhotoRef, newId } from '../../types';

interface RawPhoto {
  fileName?: string;
  takenAt?: string;
  description?: string;
}

function fromTakeoutSidecar(data: Record<string, unknown>): RawPhoto {
  const taken = (data.photoTakenTime ?? data.creationTime ?? {}) as Record<string, unknown>;
  return {
    fileName: (data.title as string) ?? undefined,
    takenAt: (taken.timestamp as string)
      ? new Date(Number(taken.timestamp) * 1000).toISOString()
      : (taken.formatted as string) ?? undefined,
    description: (data.description as string) || undefined,
  };
}

export function importGooglePhotos(text: string): PhotoRef[] {
  const data = JSON.parse(text);
  const items: RawPhoto[] = Array.isArray(data)
    ? data.map((d) => ({
        fileName: d.fileName ?? d.title,
        takenAt: d.takenAt,
        description: d.description,
      }))
    : [fromTakeoutSidecar(data)];

  return items
    .filter((p) => p.fileName || p.takenAt)
    .map((p) => ({
      id: newId('photo'),
      fileName: p.fileName,
      description: p.description,
      takenAt: p.takenAt,
      favorite: false,
      source: 'google-photos' as const,
    }));
}
