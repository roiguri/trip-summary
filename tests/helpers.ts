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
