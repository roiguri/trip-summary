// The mock sources (data/mock/, from scripts/make-mocks.ts) must stay shaped like the real ones and
// agree with their own answer key, or the importer and merge tests built on them prove nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const read = (f: string) => readFileSync(`data/mock/${f}`, 'utf8');
const json = (f: string) => JSON.parse(read(f));
const timeline = json('Timeline.json');
const expected = json('expected.json');
const picker = json('picker.json');
const files = json('picker-files.json');
const edits = json('edits.json');

// Formats seen in the real Android export.
const LOCAL_TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}[+-]\d\d:\d\d$/;
const LAT_LNG = /^-?\d{1,3}\.\d+°, -?\d{1,3}\.\d+°$/;
const PLACE_ID = /^ChIJ[A-Za-z0-9_-]{23}$/;

const segKey = (s: any) =>
  s.visit
    ? `visit:${new Date(s.startTime).toISOString()}:${s.visit.topCandidate.placeId}`
    : `activity:${new Date(s.startTime).toISOString()}:${s.activity.topCandidate.type}`;

test('the Jarvis mock loads into the real schema with intact references', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(read('jarvis.sql'));
  db.exec('PRAGMA foreign_keys = ON');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  const trip = db.prepare('SELECT trip_id FROM trips WHERE is_current = 1').get() as {
    trip_id: string;
  };
  assert.equal(trip.trip_id, expected.trip);
  for (const [key, id] of Object.entries(expected.entryIds))
    assert.ok(db.prepare('SELECT 1 FROM itinerary WHERE entry_id = ?').get(id as number), key);
});

test('Timeline segments use the real field names and formats', () => {
  assert.deepEqual(Object.keys(timeline), [
    'semanticSegments',
    'rawSignals',
    'userLocationProfile',
  ]);
  for (const s of timeline.semanticSegments) {
    assert.match(s.startTime, LOCAL_TIME);
    assert.match(s.endTime, LOCAL_TIME);
    if (s.visit) {
      assert.equal(typeof s.visit.hierarchyLevel, 'number');
      assert.match(s.visit.topCandidate.placeId, PLACE_ID);
      assert.equal(typeof s.visit.topCandidate.semanticType, 'string');
      assert.match(s.visit.topCandidate.placeLocation.latLng, LAT_LNG);
    }
    if (s.activity) {
      assert.match(s.activity.start.latLng, LAT_LNG);
      assert.match(s.activity.end.latLng, LAT_LNG);
      assert.equal(typeof s.activity.distanceMeters, 'number');
      assert.equal(typeof s.activity.topCandidate.type, 'string');
    }
    if ('startTimeTimezoneUtcOffsetMinutes' in s) {
      // The offset written in the time and the offset field must agree.
      const m = s.startTime.match(/([+-])(\d\d):(\d\d)$/);
      const minutes = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
      assert.equal(s.startTimeTimezoneUtcOffsetMinutes, minutes);
    }
  }
});

test('every segment in the answer key exists in the Timeline, once', () => {
  const keys = timeline.semanticSegments.filter((s: any) => s.visit || s.activity).map(segKey);
  assert.equal(new Set(keys).size, keys.length, 'segment keys are unique');
  const named = [
    ...Object.values(expected.matches).flatMap((m: any) => (m ? [m.segment] : [])),
    ...expected.suggestions,
    ...expected.filteredOut,
    ...expected.outsideWindow,
  ];
  for (const k of named) assert.ok(keys.includes(k), k);
});

test('the answer key covers the cases found in the real data', () => {
  const by = Object.values(expected.matches).map((m: any) => m?.by ?? 'none');
  for (const kind of ['id+distance', 'distance', 'id', 'none']) assert.ok(by.includes(kind), kind);
  const segs = timeline.semanticSegments;
  assert.ok(
    segs.some((s: any) => s.visit?.hierarchyLevel > 0),
    'a nested visit',
  );
  assert.ok(
    segs.some((s: any) => !('startTimeTimezoneUtcOffsetMinutes' in s)),
    'a segment without offsets',
  );
  assert.ok(
    segs.some((s: any) => s.timelinePath) && segs.some((s: any) => s.timelineMemory),
    'kinds to drop',
  );
  assert.ok(
    segs.some(
      (s: any) => s.startTimeTimezoneUtcOffsetMinutes !== s.endTimeTimezoneUtcOffsetMinutes,
    ),
    'a leg across time zones',
  );
});

test('Picker items have the real fields and no location', () => {
  for (const m of picker.mediaItems) {
    assert.ok(
      m.id && m.type && m.mediaFile?.baseUrl && m.mediaFile.mimeType && m.mediaFile.filename,
      m.id,
    );
    assert.match(m.createTime, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    assert.ok(!JSON.stringify(m).match(/lat|lng|location/i), `${m.id} has no location`);
    assert.ok(m.id in files, `${m.id} has a mock file entry`);
  }
  assert.ok(
    picker.mediaItems.some((m: any) => m.type === 'VIDEO'),
    'a video',
  );
  assert.ok(
    Object.values(files).some((f: any) => !f.exifOffset),
    'a photo without an EXIF offset',
  );
});

test('edits refer to media and entries that exist', () => {
  const ids = new Set(picker.mediaItems.map((m: any) => m.id));
  for (const id of Object.keys(edits.photoCaptions)) assert.ok(ids.has(id), id);
  for (const [id, entry] of Object.entries(edits.photoEntries)) {
    assert.ok(ids.has(id), id);
    assert.ok((entry as string) in expected.entryIds, entry as string);
  }
});
