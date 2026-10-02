// Builds the mock sources in data/mock/ from data/sample-trip.json: a Jarvis database (as SQL), an
// Android Timeline export and Google Photos Picker results, shaped like the real ones (field names
// and formats checked against real exports; see docs/DATA-DESIGN.md, "Findings from the real
// sources"). Also writes the edits that recreate the sample's titles and captions, and an answer key
// for the importer and merge tests. Deterministic: the same input always gives the same files.
//
//   npm run mocks            # rewrite data/mock/
//   npm run mocks -- --check # fail if data/mock/ is out of date (CI)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { CORE_SCHEMA } from '../lib/schema.ts';
import type { TripFile } from '../lib/db.ts';

const OUT = path.resolve('data/mock');
const sample: TripFile = JSON.parse(readFileSync('data/sample-trip.json', 'utf8'));
const TZ_OFFSET = -420; // the sample's dates are in May: America/Los_Angeles is UTC-7
const DENVER_OFFSET = -360;

// --- helpers ---------------------------------------------------------------------------------------

const places = new Map((sample.places ?? []).map((p) => [p.key, p]));
const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const offsetText = (min: number) =>
  `${min < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(min) / 60))}:${pad(Math.abs(min) % 60)}`;
/** Local wall time on a date, shifted by minutes, as the Timeline writes it (local + offset). */
function at(date: string, time: string, shiftMin = 0, offset = TZ_OFFSET) {
  const [h, m] = time.split(':').map(Number);
  const seconds = Math.round((h * 60 + m + shiftMin) * 60 - offset * 60);
  const utc = Date.parse(`${date}T00:00:00Z`) + seconds * 1000;
  const local = new Date(utc + offset * 60_000).toISOString().slice(0, 23);
  return { text: `${local}${offsetText(offset)}`, utc: new Date(utc).toISOString() };
}
const latLng = (lat: number, lng: number) => `${lat.toFixed(7)}°, ${lng.toFixed(7)}°`;
/** Moves a point by metres north and east. */
const nudge = (lat: number, lng: number, north: number, east: number) => [
  lat + north / 111_320,
  lng + east / (111_320 * Math.cos((lat * Math.PI) / 180)),
];
/** A fake Google place ID: 27 characters starting with "ChIJ", like the real ones. */
const placeId = (seed: string) =>
  `ChIJ${seed.replace(/[^A-Za-z0-9]/g, '').padEnd(23, 'x')}`.slice(0, 27);
const plannedId = (key: string) => placeId(`mock${key}`);
const wrongId = (key: string) => placeId(`gmaps${key}`);

// --- Timeline ----------------------------------------------------------------------------------------

type Segment = Record<string, unknown> & { startTime: string };
const segments: Segment[] = [];
const expected = {
  matches: {} as Record<string, { segment: string; by: 'id' | 'distance' | 'id+distance' } | null>,
  transitModes: {} as Record<string, string>,
  suggestions: [] as string[],
  filteredOut: [] as string[],
  outsideWindow: [] as string[],
};
const keyOf = (kind: string, startUtc: string, idOrMode: string) =>
  `${kind}:${startUtc}:${idOrMode}`;

function visit(o: {
  date: string;
  from: string;
  to: string;
  endDate?: string;
  lat: number;
  lng: number;
  id: string;
  type?: string;
  level?: number;
  offset?: number | null;
}) {
  const offset = o.offset === undefined ? TZ_OFFSET : o.offset;
  const s = at(o.date, o.from, 0, offset ?? TZ_OFFSET);
  const e = at(o.endDate ?? o.date, o.to, 0, offset ?? TZ_OFFSET);
  segments.push({
    startTime: s.text,
    endTime: e.text,
    ...(offset === null
      ? {}
      : { startTimeTimezoneUtcOffsetMinutes: offset, endTimeTimezoneUtcOffsetMinutes: offset }),
    visit: {
      hierarchyLevel: o.level ?? 0,
      probability: 0.83,
      topCandidate: {
        placeId: o.id,
        semanticType: o.type ?? 'UNKNOWN',
        probability: 0.71,
        placeLocation: { latLng: latLng(o.lat, o.lng) },
      },
    },
  });
  return keyOf('visit', s.utc, o.id);
}

function activity(o: {
  date: string;
  from: string;
  to: string;
  mode: string;
  km: number;
  a: [number, number];
  b: [number, number];
  endOffset?: number;
  offset?: number | null;
}) {
  const offset = o.offset === undefined ? TZ_OFFSET : o.offset;
  const s = at(o.date, o.from, 0, offset ?? TZ_OFFSET);
  const e = at(o.date, o.to, 0, o.endOffset ?? offset ?? TZ_OFFSET);
  segments.push({
    startTime: s.text,
    endTime: e.text,
    ...(offset === null
      ? {}
      : {
          startTimeTimezoneUtcOffsetMinutes: offset,
          endTimeTimezoneUtcOffsetMinutes: o.endOffset ?? offset,
        }),
    activity: {
      start: { latLng: latLng(...o.a) },
      end: { latLng: latLng(...o.b) },
      distanceMeters: Math.round(o.km * 1000),
      probability: 0.9,
      topCandidate: { type: o.mode, probability: 0.87 },
    },
  });
  return keyOf('activity', s.utc, o.mode);
}

const entry = (key: string) => sample.itinerary.find((i) => i.key === key)!;
const where = (key: string) => {
  const p = places.get(entry(key).place!)!;
  return [p.lat!, p.lng!] as [number, number];
};

// Planned stops. Each line is one case the merge has to handle.
const visitCases: [
  string,
  { shift?: number; to?: string; id?: 'planned' | 'wrong'; metres?: number },
][] = [
  ['carmel-beach-visit', { shift: 8 }], // same ID, on the spot, a little late
  ['point-lobos-visit', { id: 'wrong', metres: 40 }], // Maps chose another place ID: distance
  ['lunch', { shift: -5 }], // plan has no Google ID for it: distance only
  ['bixby-visit', { shift: 3 }],
  ['garrapata-visit', { id: 'wrong', metres: 90 }], // wrong ID, 90 m off: still within 150 m
  ['aquarium-visit', { shift: 75 }], // over an hour late: the planned time is only a hint
  // lovers-point-visit: no visit at all (skipped), keeps its planned times
  ['point-sur-visit', { shift: 10 }],
  ['mcway-visit', { id: 'wrong', metres: 25 }],
  ['nepenthe-visit', { metres: 400 }], // same ID, but Maps' pin is 400 m away: matches by ID
  ['pfeiffer-visit', { shift: -10 }],
];
for (const [key, c] of visitCases) {
  const e = entry(key);
  const [lat, lng] = where(key);
  const [vlat, vlng] = c.metres ? nudge(lat, lng, c.metres, 0) : [lat, lng];
  const shift = c.shift ?? 0;
  const id = c.id === 'wrong' ? wrongId(e.place!) : plannedId(e.place!);
  const from = at(e.start_date, e.start_time!, shift).text.slice(11, 16);
  const to = at(e.start_date, e.end_time!, shift).text.slice(11, 16);
  const seg = visit({ date: e.start_date, from, to, lat: vlat, lng: vlng, id });
  const hasPlannedId = key !== 'lunch';
  expected.matches[key] = {
    segment: seg,
    by:
      c.id === 'wrong' || !hasPlannedId ? 'distance' : (c.metres ?? 0) > 150 ? 'id' : 'id+distance',
  };
}
expected.matches['lovers-point-visit'] = null;

// The aquarium sits inside a larger place: the planned visit is nested (level 1) in a parent visit
// (level 0) that starts a little earlier and ends later.
{
  const [lat, lng] = where('aquarium-visit');
  const childId = plannedId(entry('aquarium-visit').place!);
  const child = segments.find(
    (s) =>
      (s.visit as { topCandidate: { placeId: string } } | undefined)?.topCandidate.placeId ===
      childId,
  )!;
  (child.visit as { hierarchyLevel: number }).hierarchyLevel = 1;
  expected.filteredOut.push(
    visit({
      date: '2026-05-17',
      from: '11:05',
      to: '14:00',
      lat: lat + 0.002,
      lng: lng + 0.001,
      id: placeId('mockcanneryrow'),
    }),
  );
}

// Stays: visits at the lodging, split around the evening stops where loose photos were taken (a
// Timeline has one top-level visit at a time). The first visit matches the stay; the later ones are
// part of it, not suggestions.
for (const [key, visits] of [
  [
    'inn',
    [
      ['2026-05-15', '15:20', '2026-05-15', '16:20'],
      ['2026-05-15', '17:40', '2026-05-16', '08:30'],
      ['2026-05-16', '19:00', '2026-05-17', '09:40'],
    ],
  ],
  [
    'river-lodge-stay',
    [
      ['2026-05-18', '16:10', '2026-05-18', '18:50'],
      ['2026-05-18', '20:45', '2026-05-19', '07:40'],
    ],
  ],
  ['ridge-cabin-stay', [['2026-05-19', '17:45', '2026-05-20', '07:20']]],
] as const) {
  const [lat, lng] = where(key);
  const segs = visits.map(([d1, t1, d2, t2]) =>
    visit({ date: d1, from: t1, endDate: d2, to: t2, lat, lng, id: plannedId(entry(key).place!) }),
  );
  expected.matches[key] = { segment: segs[0], by: 'id+distance' };
  expected.filteredOut.push(...segs.slice(1));
}

// Planned transit, each with the mode it should get.
const transit: [string, string, number, number?][] = [
  ['drive-hwy1', 'IN_PASSENGER_VEHICLE', 21],
  ['drive-south', 'IN_PASSENGER_VEHICLE', 42],
  ['shuttle-pfeiffer', 'IN_BUS', 6],
  ['train-north', 'IN_TRAIN', 104],
  ['flight-home', 'FLYING', 1530, DENVER_OFFSET], // lands an hour ahead: two offsets
];
for (const [key, mode, km, endOffset] of transit) {
  const e = entry(key);
  activity({
    date: e.start_date,
    from: e.start_time!,
    to: e.end_time!,
    mode,
    km,
    a: [36.55, -121.92],
    b: [36.27, -121.81],
    endOffset,
  });
  expected.transitModes[key] = mode;
}

// Unplanned stops where the loose photos were taken: these become suggestions.
const looseStops: [string, string, string][] = [
  ['2026-05-15', '16:30', '17:25'],
  ['2026-05-16', '13:00', '13:40'],
  ['2026-05-18', '19:00', '20:35'],
  ['2026-05-19', '07:55', '08:30'],
  ['2026-05-20', '07:45', '08:05'],
];
for (const [date, from, to] of looseStops) {
  const photo = (sample.photos ?? []).find(
    (p) => p.date === date && !p.entry && p.lat && p.time >= from,
  )!;
  const key = visit({
    date,
    from,
    to,
    lat: photo.lat!,
    lng: photo.lng!,
    id: placeId(`mockstop${date}${from}`),
  });
  // A stop at the lodging on a day of the stay is coming home to it, not a new place.
  const atLodging = sample.itinerary.some((i) => {
    if (i.type !== 'lodging' || !i.place) return false;
    const p = places.get(i.place)!;
    return (
      date >= i.start_date &&
      date <= (i.end_date ?? i.start_date) &&
      Math.abs(p.lat! - photo.lat!) < 0.001 &&
      Math.abs(p.lng! - photo.lng!) < 0.001
    );
  });
  (atLodging ? expected.filteredOut : expected.suggestions).push(key);
}
// A long unplanned drive, also a suggestion.
expected.suggestions.push(
  activity({
    date: '2026-05-17',
    from: '13:00',
    to: '13:35',
    mode: 'IN_PASSENGER_VEHICLE',
    km: 18,
    a: [36.6, -121.9],
    b: [36.62, -121.75],
  }),
);

// Noise the filters remove: a short stop, a short walk, and home and work visits.
expected.filteredOut.push(
  visit({
    date: '2026-05-16',
    from: '10:25',
    to: '10:33',
    lat: 36.37,
    lng: -121.9,
    id: placeId('mockcoffee'),
  }),
  activity({
    date: '2026-05-16',
    from: '10:33',
    to: '10:45',
    mode: 'WALKING',
    km: 0.6,
    a: [36.37, -121.9],
    b: [36.372, -121.896],
  }),
  // The day after the trip is inside the slice (one day either side) but home is never a suggestion.
  visit({
    date: '2026-05-21',
    from: '09:00',
    to: '18:00',
    lat: 32.08,
    lng: 34.78,
    id: placeId('mockhome'),
    type: 'HOME',
  }),
  // No UTC offset on this one, as on about a third of real segments.
  visit({
    date: '2026-05-14',
    from: '08:00',
    to: '17:00',
    lat: 32.1,
    lng: 34.8,
    id: placeId('mockwork'),
    type: 'INFERRED_WORK',
    offset: null,
  }),
);

// Outside the slice (more than a day either side of the trip): never uploaded.
expected.outsideWindow.push(
  visit({
    date: '2026-05-12',
    from: '09:00',
    to: '18:00',
    lat: 32.08,
    lng: 34.78,
    id: placeId('mockhome'),
    type: 'HOME',
  }),
  visit({
    date: '2026-05-23',
    from: '20:00',
    to: '22:00',
    lat: 32.07,
    lng: 34.77,
    id: placeId('mockdinner'),
  }),
  activity({
    date: '2025-01-10',
    from: '08:00',
    to: '08:40',
    mode: 'IN_BUS',
    km: 12,
    a: [32.1, 34.8],
    b: [32.0, 34.75],
  }),
);

// Kinds the importer drops: a path (location trace) and a timelineMemory.
segments.push({
  startTime: at('2026-05-16', '09:00').text,
  endTime: at('2026-05-16', '11:00').text,
  timelinePath: [
    { point: latLng(36.55, -121.92), time: at('2026-05-16', '09:00').text },
    { point: latLng(36.37, -121.9), time: at('2026-05-16', '09:44').text },
  ],
});
segments.push({
  startTime: at('2026-05-14', '00:00').text,
  endTime: at('2026-05-21', '00:00').text,
  timelineMemory: {
    trip: {
      distanceFromOriginKms: 12_000,
      destinations: [{ identifier: { placeId: placeId('mockregion') } }],
    },
  },
});

segments.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
const timeline = {
  semanticSegments: segments,
  rawSignals: [],
  userLocationProfile: { frequentPlaces: [] },
};

// --- Jarvis database ---------------------------------------------------------------------------------

const q = (v: unknown) =>
  v === undefined || v === null
    ? 'NULL'
    : typeof v === 'number'
      ? String(v)
      : `'${String(v).replace(/'/g, "''")}'`;
const sql: string[] = [
  '-- Mock Jarvis travel database (generated by scripts/make-mocks.ts; do not edit).',
  '-- The schema is the real one (lib/schema.ts CORE_SCHEMA). IDs are explicit so tests can name rows.',
  CORE_SCHEMA.trim(),
  'BEGIN;',
];
const d = sample.destination;
sql.push(
  `INSERT INTO destinations (destination_id,name,kind,country,timezone,lat,lng) VALUES (1,${q(d.name)},${q(d.kind)},${q(d.country)},${q(d.timezone)},${q(d.lat)},${q(d.lng)});`,
  // Another destination and trip: the importer must take only the trip it is asked for.
  `INSERT INTO destinations (destination_id,name,kind,country,timezone) VALUES (2,'Lisbon','city','Portugal','Europe/Lisbon');`,
);
const t = sample.trip;
sql.push(
  `INSERT INTO trips (trip_id,title,destination_id,start_date,end_date,status,is_current,notes) VALUES (${q(t.id)},${q(t.title)},1,${q(t.start_date)},${q(t.end_date)},'draft',1,NULL);`,
  `INSERT INTO trips (trip_id,title,destination_id,start_date,end_date,status,is_current) VALUES ('mock-other','Someday Lisbon',2,NULL,NULL,'draft',0);`,
);
const placeRow = new Map<string, number>();
(sample.places ?? []).forEach((p, i) => {
  placeRow.set(p.key, i + 1);
  // Lunch has no Google ID (as about a tenth of real places), nor do places without coordinates.
  const gid = p.key === places.get(entry('lunch').place!)!.key || !p.lat ? null : plannedId(p.key);
  sql.push(
    `INSERT INTO places (place_id,google_place_id,destination_id,title,address,maps_url,lat,lng,category) VALUES (${i + 1},${q(gid)},1,${q(p.title)},${q(p.address)},${q(p.maps_url)},${q(p.lat)},${q(p.lng)},${q(p.category)});`,
  );
});
sql.push(
  `INSERT INTO places (place_id,google_place_id,destination_id,title,lat,lng,category) VALUES (${placeRow.size + 1},${q(placeId('mocktram28'))},2,'Tram 28',38.7139,-9.1334,'transport');`,
);
const entryIds: Record<string, number> = {};
sample.itinerary.forEach((i, n) => {
  entryIds[i.key] = n + 1;
  sql.push(
    `INSERT INTO itinerary (entry_id,trip_id,place_id,item_type,title,start_date,end_date,start_time,end_time,departure_timezone,arrival_timezone,from_location,to_location,confirmation_code,notes) VALUES (${n + 1},${q(t.id)},${q(i.place ? placeRow.get(i.place) : null)},${q(i.type)},${q(i.title)},${q(i.start_date)},${q(i.end_date)},${q(i.start_time)},${q(i.end_time)},${q(i.departure_timezone)},${q(i.arrival_timezone)},${q(i.from_location)},${q(i.to_location)},${q(i.confirmation_code)},${q(i.notes)});`,
  );
});
let nextEntry = sample.itinerary.length + 1;
for (const day of sample.days ?? [])
  for (const tag of day.tags ?? [])
    sql.push(
      `INSERT INTO itinerary (entry_id,trip_id,item_type,title,start_date) VALUES (${nextEntry++},${q(t.id)},'tag',${q(tag)},${q(day.date)});`,
    );
sql.push(
  `INSERT INTO itinerary (entry_id,trip_id,place_id,item_type,start_date) VALUES (${nextEntry++},'mock-other',${placeRow.size + 1},'place','2027-04-02');`,
  `INSERT INTO wishlist (destination_id,place_id,notes) VALUES (1,${placeRow.get('point-lobos')},'Go back at low tide');`,
  `INSERT INTO wishlist (destination_id,place_id) VALUES (2,${placeRow.size + 1});`,
  'COMMIT;',
);

// --- Photos Picker -----------------------------------------------------------------------------------

const media: Record<string, unknown>[] = [];
const files: Record<string, { file: string | null; exifOffset?: string }> = {};
const captions: Record<string, string> = {};
(sample.photos ?? []).forEach((p, n) => {
  const id = `mock-media-${pad(n + 1, 3)}`;
  // Photos taken in the same minute get distinct seconds, as a camera would give them.
  const createTime = at(p.date, p.time, (n % 60) / 60).utc.replace('.000Z', 'Z');
  const stamp = createTime.replace(/[-:TZ]/g, '').slice(0, 14);
  media.push({
    id,
    createTime,
    type: 'PHOTO',
    mediaFile: {
      baseUrl: `https://mock.photospicker.invalid/${id}`,
      mimeType: 'image/jpeg',
      filename: `PXL_${stamp.slice(0, 8)}_${stamp.slice(8)}000.jpg`,
      mediaFileMetadata: {
        width: 4080,
        height: 3072,
        cameraMake: 'Google',
        cameraModel: 'Pixel 9',
        photoMetadata: {
          focalLength: 6.9,
          apertureFNumber: 1.7,
          isoEquivalent: 50,
          exposureTime: '0.001s',
        },
      },
    },
  });
  // Every tenth photo has no offset in its EXIF: its local time comes from the Timeline instead.
  files[id] = { file: p.url, ...(n % 10 === 9 ? {} : { exifOffset: offsetText(TZ_OFFSET) }) };
  captions[id] = p.caption;
});
// One video among the loose moments.
media.push({
  id: 'mock-media-video-1',
  createTime: at('2026-05-18', '20:21').utc.replace('.000Z', 'Z'),
  type: 'VIDEO',
  mediaFile: {
    baseUrl: 'https://mock.photospicker.invalid/mock-media-video-1',
    mimeType: 'video/mp4',
    filename: 'PXL_20260519_032100000.TS.mp4',
    mediaFileMetadata: {
      width: 1920,
      height: 1080,
      cameraMake: 'Google',
      cameraModel: 'Pixel 9',
      videoMetadata: { fps: 30, processingStatus: 'READY' },
    },
  },
});
files['mock-media-video-1'] = { file: null, exifOffset: offsetText(TZ_OFFSET) };

// --- edits that recreate the sample ------------------------------------------------------------------

const edits = {
  $comment:
    'What the owner would have written in edit mode: none of it comes from a source. Applying these to the merged mocks must give the sample trip.',
  trip: { subtitle: t.subtitle },
  dayTitles: Object.fromEntries(
    (sample.days ?? []).filter((x) => x.title).map((x) => [x.date, x.title]),
  ),
  photoCaptions: captions,
  photoEntries: Object.fromEntries(
    (sample.photos ?? []).flatMap((p, n) =>
      p.entry ? [[`mock-media-${pad(n + 1, 3)}`, p.entry]] : [],
    ),
  ),
};

// --- write -------------------------------------------------------------------------------------------

const outputs: Record<string, string> = {
  'jarvis.sql': sql.join('\n') + '\n',
  'Timeline.json': JSON.stringify(timeline, null, 2) + '\n',
  'picker.json': JSON.stringify({ mediaItems: media }, null, 2) + '\n',
  'picker-files.json': JSON.stringify(files, null, 2) + '\n',
  'edits.json': JSON.stringify(edits, null, 2) + '\n',
  'expected.json':
    JSON.stringify(
      {
        $comment:
          'Answer key for the importer and merge tests. Segment keys are kind:startTime(UTC):placeId-or-mode.',
        trip: t.id,
        slice: { from: '2026-05-14', to: '2026-05-21' },
        entryIds,
        ...expected,
      },
      null,
      2,
    ) + '\n',
};

if (process.argv.includes('--check')) {
  const stale = Object.entries(outputs).filter(([f, text]) => {
    try {
      return readFileSync(path.join(OUT, f), 'utf8') !== text;
    } catch {
      return true;
    }
  });
  if (stale.length) {
    console.error(
      `data/mock is out of date (${stale.map(([f]) => f).join(', ')}): run npm run mocks`,
    );
    process.exit(1);
  }
  console.log('data/mock is up to date');
} else {
  mkdirSync(OUT, { recursive: true });
  for (const [f, text] of Object.entries(outputs)) writeFileSync(path.join(OUT, f), text);
  console.log(`Wrote ${Object.keys(outputs).length} files to data/mock/`);
}
