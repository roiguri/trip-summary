// The Google Photos Picker API (findings in docs/DATA-DESIGN.md): a session, its picker page, the
// picked items, and their files through base URLs that need the owner's token. In development and
// the tests a mock stands in, serving data/mock/picker.json with the sample's own pictures.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const API = 'https://photospicker.googleapis.com/v1';

export type PickedItem = {
  id: string;
  createTime: string;
  type: 'PHOTO' | 'VIDEO';
  mediaFile: {
    baseUrl: string;
    mimeType: string;
    filename: string;
    mediaFileMetadata?: { width?: number; height?: number };
  };
};

export type Picker = {
  createSession(): Promise<{ id: string; pickerUri: string }>;
  isDone(sessionId: string): Promise<boolean>;
  listItems(sessionId: string): Promise<PickedItem[]>;
  /** A file's bytes: `=d` the original photo, `=dv` the video, `=w…-h…` an image (a video's still). */
  fetchFile(item: PickedItem, suffix: string): Promise<Buffer>;
  deleteSession(sessionId: string): Promise<void>;
};

export function googlePicker(token: string): Picker {
  const call = async (url: string, init: RequestInit = {}) => {
    const r = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...init.headers },
    });
    if (!r.ok) throw new Error(`Google Photos answered ${r.status}`);
    return r;
  };
  return {
    async createSession() {
      const s = (await (await call(`${API}/sessions`, { method: 'POST', body: '{}' })).json()) as {
        id: string;
        pickerUri: string;
      };
      return { id: s.id, pickerUri: s.pickerUri };
    },
    async isDone(id) {
      return !!(
        (await (await call(`${API}/sessions/${encodeURIComponent(id)}`)).json()) as {
          mediaItemsSet?: boolean;
        }
      ).mediaItemsSet;
    },
    async listItems(id) {
      const items: PickedItem[] = [];
      let pageToken = '';
      do {
        const q = new URLSearchParams({ sessionId: id, pageSize: '100', pageToken });
        const page = (await (await call(`${API}/mediaItems?${q}`)).json()) as {
          mediaItems?: PickedItem[];
          nextPageToken?: string;
        };
        items.push(...(page.mediaItems ?? []));
        pageToken = page.nextPageToken ?? '';
      } while (pageToken);
      return items;
    },
    async fetchFile(item, suffix) {
      return Buffer.from(await (await call(item.mediaFile.baseUrl + suffix)).arrayBuffer());
    },
    async deleteSession(id) {
      await call(`${API}/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(
        () => undefined,
      );
    },
  };
}

/** The mock picker: every item of data/mock/picker.json, its files read from public/. */
export function mockPicker(root = process.cwd()): Picker {
  const files = async () =>
    JSON.parse(await readFile(path.join(root, 'data/mock/picker-files.json'), 'utf8')) as Record<
      string,
      { file: string | null; exifOffset?: string }
    >;
  return {
    async createSession() {
      return { id: 'mock', pickerUri: '' };
    },
    async isDone() {
      return true;
    },
    async listItems() {
      return (
        JSON.parse(await readFile(path.join(root, 'data/mock/picker.json'), 'utf8')) as {
          mediaItems: PickedItem[];
        }
      ).mediaItems;
    },
    async fetchFile(item, suffix) {
      const f = (await files())[item.id];
      // The mock video has no file of its own: a sample picture stands in for its still, and a few
      // bytes for the video.
      if (suffix === '=dv') return Buffer.from('mock video');
      return readFile(path.join(root, 'public', f?.file ?? '/photos/coast-1.jpg'));
    },
    async deleteSession() {},
  };
}
