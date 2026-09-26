import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
export type Photo = {
  id: number;
  url: string;
  caption: string;
  lat: number | null;
  lng: number | null;
  time: string;
  entry_id: number | null;
};
export type Entry = {
  id: number;
  day: string;
  type: 'place' | 'lodging' | 'transit' | 'note' | 'photo' | 'cluster';
  title: string;
  time: string;
  end_time: string | null;
  notes: string;
  lat: number | null;
  lng: number | null;
  tags: string[];
  maps_url?: string | null;
  photos: Photo[];
  check_out: string | null;
  from_location: string | null;
  to_location: string | null;
  departure_timezone: string | null;
  arrival_timezone: string | null;
};
export type Day = { date: string; title: string; entries: Entry[] };
const file = path.join(process.cwd(), 'trip-sample.db');
const db = new DatabaseSync(file);
db.exec(`CREATE TABLE IF NOT EXISTS destinations (destination_id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL COLLATE NOCASE UNIQUE,kind TEXT CHECK(kind IN ('city','region','country')),country TEXT,timezone TEXT NOT NULL,lat REAL,lng REAL,google_locality TEXT,created_at DATETIME DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS trips (trip_id TEXT PRIMARY KEY,title TEXT,destination_id INTEGER NOT NULL REFERENCES destinations(destination_id),start_date DATE,end_date DATE,status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','archived')),is_current INTEGER NOT NULL DEFAULT 0,notes TEXT,created_at DATETIME DEFAULT (datetime('now')),CHECK(end_date IS NULL OR start_date IS NULL OR end_date>=start_date));CREATE UNIQUE INDEX IF NOT EXISTS one_current_trip ON trips(is_current) WHERE is_current=1;
CREATE TABLE IF NOT EXISTS places (place_id INTEGER PRIMARY KEY AUTOINCREMENT,google_place_id TEXT UNIQUE,destination_id INTEGER NOT NULL REFERENCES destinations(destination_id),title TEXT NOT NULL,address TEXT,maps_url TEXT,lat REAL,lng REAL,category TEXT,google_type TEXT,google_type_label TEXT,google_types TEXT,city TEXT,country TEXT,created_at DATETIME DEFAULT (datetime('now')));CREATE INDEX IF NOT EXISTS places_by_destination ON places(destination_id);
CREATE TABLE IF NOT EXISTS wishlist (wishlist_id INTEGER PRIMARY KEY AUTOINCREMENT,destination_id INTEGER NOT NULL REFERENCES destinations(destination_id),place_id INTEGER REFERENCES places(place_id),title TEXT,city TEXT,notes TEXT,priority INTEGER DEFAULT 3 CHECK(priority BETWEEN 1 AND 5),done_at DATE,added_at DATETIME DEFAULT (datetime('now')),UNIQUE(destination_id,place_id),UNIQUE(destination_id,title),CHECK(place_id IS NOT NULL OR title IS NOT NULL));CREATE INDEX IF NOT EXISTS wishlist_by_destination ON wishlist(destination_id);
CREATE TABLE IF NOT EXISTS itinerary (entry_id INTEGER PRIMARY KEY AUTOINCREMENT,trip_id TEXT NOT NULL REFERENCES trips(trip_id),place_id INTEGER REFERENCES places(place_id),item_type TEXT NOT NULL CHECK(item_type IN ('place','lodging','transit','note','tag')),title TEXT,start_date DATE NOT NULL,end_date DATE,start_time TEXT,end_time TEXT,departure_timezone TEXT,arrival_timezone TEXT,from_location TEXT,to_location TEXT,confirmation_code TEXT,notes TEXT,created_at DATETIME DEFAULT (datetime('now')),CHECK(place_id IS NOT NULL OR title IS NOT NULL),CHECK(end_date IS NULL OR end_date>=start_date),CHECK(item_type='lodging' OR start_time IS NOT NULL OR end_time IS NULL));CREATE INDEX IF NOT EXISTS itinerary_by_trip_date ON itinerary(trip_id,start_date);
CREATE TABLE IF NOT EXISTS photos (photo_id INTEGER PRIMARY KEY,entry_id INTEGER,date TEXT NOT NULL,time TEXT NOT NULL,url TEXT NOT NULL,caption TEXT NOT NULL,latitude REAL,longitude REAL);`);
if (!db.prepare('SELECT trip_id FROM trips LIMIT 1').get()) {
  db.prepare(
    'INSERT INTO destinations (destination_id,name,kind,country,timezone,lat,lng) VALUES (1,?,?,?,?,?,?)',
  ).run('Monterey Coast', 'region', 'United States', 'America/Los_Angeles', 36.53, -121.92);
  db.prepare(
    'INSERT INTO trips (trip_id,title,destination_id,start_date,end_date,status,is_current) VALUES (?,?,?,?,?,?,?)',
  ).run('sample-coast', 'Three days along the coast', 1, '2026-05-15', '2026-05-17', 'draft', 1);
  const places: [number, string, number, number][] = [
    [1, 'Carmel Beach', 36.5552, -121.9246],
    [2, 'Point Lobos State Natural Reserve', 36.5162, -121.9417],
    [3, 'Cypress & Salt Café', 36.5548, -121.9221],
    [4, 'Bixby Creek Bridge', 36.3714, -121.9021],
    [5, 'Garrapata State Park', 36.4604, -121.9252],
    [6, 'Monterey Bay Aquarium', 36.6181, -121.9018],
    [7, 'Lovers Point Park', 36.625, -121.9165],
  ];
  const insertPlace = db.prepare(
    'INSERT INTO places (place_id,title,destination_id,lat,lng,category) VALUES (?,?,1,?,?,?)',
  );
  places.forEach((p, i) =>
    insertPlace.run(...p, ['beach', 'nature', 'food', 'viewpoint', 'nature', 'museum', 'park'][i]),
  );
  const rows: [
    number,
    number | null,
    string,
    string,
    string,
    string,
    string | null,
    string,
    string,
  ][] = [
    [
      1,
      1,
      'place',
      'Carmel Beach',
      '2026-05-15',
      '09:20',
      '10:45',
      'Morning light over the dunes. A slow walk along the shore before heading south.',
      'Coast,Walk',
    ],
    [
      2,
      2,
      'place',
      'Point Lobos State Natural Reserve',
      '2026-05-15',
      '11:15',
      '13:00',
      'Follow the cliff trail to the cove. The view opens up around every turn.',
      'Nature,Favorite',
    ],
    [
      3,
      3,
      'place',
      'Cypress & Salt Café',
      '2026-05-15',
      '13:20',
      '14:10',
      'A quiet lunch stop, with a table by the window.',
      'Food',
    ],
    [
      4,
      null,
      'lodging',
      'Carmel Garden Inn',
      '2026-05-15',
      '15:00',
      null,
      'A small fictional inn among the trees, a short walk from the village.',
      'Stay',
    ],
    [
      5,
      null,
      'transit',
      'Drive down Highway 1',
      '2026-05-16',
      '09:00',
      '09:45',
      'The coast road winds past headlands and open sea.',
      'Drive',
    ],
    [
      6,
      4,
      'place',
      'Bixby Creek Bridge',
      '2026-05-16',
      '09:45',
      '10:20',
      'Pull over for the big coastal view.',
      'Coast,Viewpoint',
    ],
    [
      7,
      5,
      'place',
      'Garrapata State Park',
      '2026-05-16',
      '11:00',
      '12:30',
      'Wildflowers and a narrow path toward the water.',
      'Nature',
    ],
    [
      8,
      null,
      'note',
      'A little time to wander',
      '2026-05-16',
      '14:00',
      null,
      'Leave the afternoon open. Stop wherever the light looks good.',
      'Note',
    ],
    [
      9,
      6,
      'place',
      'Monterey Bay Aquarium',
      '2026-05-17',
      '10:00',
      '12:30',
      'The jellyfish galleries are worth taking your time over.',
      'Culture',
    ],
    [
      10,
      7,
      'place',
      'Lovers Point Park',
      '2026-05-17',
      '15:00',
      '16:00',
      'An easy final walk by the water.',
      'Coast',
    ],
  ];
  const ins = db.prepare(
    "INSERT INTO itinerary (entry_id,trip_id,place_id,item_type,title,start_date,start_time,end_time,notes,end_date) VALUES (?,'sample-coast',?,?,?,?,?,?,?,?)",
  );
  rows.forEach((r) =>
    ins.run(
      r[0],
      r[1],
      r[2],
      r[3],
      r[4],
      r[5],
      r[6],
      r[7],
      r[3] === 'Carmel Garden Inn' ? '2026-05-17' : null,
    ),
  );
  const photos: [
    number,
    number | null,
    string,
    string,
    string,
    string,
    number | null,
    number | null,
  ][] = [];
  function add(
    entry: number | null,
    date: string,
    time: string,
    count: number,
    caption: string,
    lat: number | null,
    lng: number | null,
  ) {
    for (let i = 0; i < count; i++) {
      let n = photos.length + 1;
      photos.push([
        n,
        entry,
        date,
        time,
        `/photos/coast-${((n - 1) % 25) + 1}.jpg`,
        `${caption}${count > 1 ? ` · ${i + 1}` : ''}`,
        lat,
        lng,
      ]);
    }
  }
  add(1, '2026-05-15', '09:45', 16, 'Morning at Carmel Beach', 36.5552, -121.9246);
  add(2, '2026-05-15', '11:40', 5, 'Cliffs at Point Lobos', 36.5162, -121.9417);
  add(3, '2026-05-15', '13:30', 2, 'Lunch stop', 36.5548, -121.9221);
  add(null, '2026-05-15', '16:42', 1, 'The road at golden hour', 36.532, -121.931);
  add(null, '2026-05-15', '17:10', 3, 'Coastal details', 36.54, -121.94);
  add(6, '2026-05-16', '10:00', 4, 'Bridge and ocean', 36.3714, -121.9021);
  add(7, '2026-05-16', '11:30', 3, 'Trail by the sea', 36.4604, -121.9252);
  add(null, '2026-05-16', '13:15', 5, 'From the road', 36.41, -121.915);
  add(null, '2026-05-16', '17:36', 1, 'Last light near the shore', null, null);
  add(9, '2026-05-17', '11:00', 3, 'Inside the aquarium', 36.6181, -121.9018);
  add(10, '2026-05-17', '15:30', 2, 'Afternoon at Lovers Point', 36.625, -121.9165);
  const ip = db.prepare('INSERT INTO photos VALUES (?,?,?,?,?,?,?,?)');
  photos.forEach((p) => ip.run(...p));
}
// Fictional transit endpoints and a second-language note for directional-layout review.
if (db.prepare("SELECT trip_id FROM trips WHERE trip_id='sample-coast'").get()) {
  db.exec(
    "UPDATE itinerary SET from_location='Carmel',to_location='Bixby Creek Bridge',departure_timezone='America/Los_Angeles',arrival_timezone='America/Los_Angeles' WHERE trip_id='sample-coast' AND entry_id=5 AND from_location IS NULL",
  );
  db.prepare(
    "INSERT OR IGNORE INTO itinerary (entry_id,trip_id,item_type,title,start_date,end_date,start_time,end_time,notes) VALUES (12,'sample-coast','place','Coast Path Walk','2026-05-15','2026-05-17','18:20','15:40','Three slow days along the shore.')",
  ).run();
  db.prepare(
    "INSERT OR IGNORE INTO itinerary (entry_id,trip_id,item_type,title,start_date,start_time,notes) VALUES (11,'sample-coast','note','רגע שקט בדרך','2026-05-16','15:20','לעצור ליד הים ולנשום קצת אוויר.')",
  ).run();
}
export function getTrip() {
  const trip = db
    .prepare(
      'SELECT trips.title,destinations.timezone FROM trips JOIN destinations USING(destination_id) WHERE trips.is_current=1',
    )
    .get() as { title: string; timezone: string };
  const raw = db
    .prepare(
      'SELECT i.*,p.lat lat,p.lng lng,p.maps_url maps_url,p.category category FROM itinerary i LEFT JOIN places p ON i.place_id=p.place_id ORDER BY i.start_date,i.start_time',
    )
    .all() as any[];
  const photos = db
    .prepare(
      'SELECT photo_id id,entry_id,date,time,url,caption,latitude lat,longitude lng FROM photos ORDER BY date,time,photo_id',
    )
    .all() as any[];
  photos.forEach((p) => {
    p.url = `/photos/coast-${((p.id - 1) % 25) + 1}.jpg`;
  });
  const dates = ['2026-05-15', '2026-05-16', '2026-05-17'];
  const titles = ['Carmel & the coves', 'The long way south', 'Monterey afternoon'];
  const days: Day[] = dates.map((date, i) => {
    const entries: Entry[] = raw
      .filter((r) => r.start_date === date)
      .map((r) => ({
        id: r.entry_id,
        day: date,
        type: r.item_type,
        title: r.title,
        time: r.start_time,
        end_time: r.end_time,
        notes: r.notes,
        lat: r.lat,
        lng: r.lng,
        maps_url: r.maps_url,
        tags:
          r.item_type === 'place'
            ? [r.category || 'Walk']
            : r.item_type === 'lodging'
              ? ['Stay']
              : [],
        photos:
          r.entry_id === 12
            ? photos.filter((p) => p.entry_id === 1).slice(0, 3)
            : photos.filter((p) => p.entry_id === r.entry_id),
        check_out: r.item_type === 'lodging' ? '2026-05-17 · 11:00' : null,
        from_location: r.from_location,
        to_location: r.to_location,
        departure_timezone: r.departure_timezone,
        arrival_timezone: r.arrival_timezone,
      }));
    const free = photos.filter((p) => p.date === date && p.entry_id === null);
    const singles = free.filter(
      (p) => free.filter((q) => q.time.slice(0, 2) === p.time.slice(0, 2)).length === 1,
    );
    const groups = Object.values(
      Object.groupBy(
        free.filter((p) => !singles.includes(p)),
        (p) => p.time.slice(0, 2),
      ),
    );
    singles.forEach((p) =>
      entries.push({
        id: 1000 + p.id,
        day: date,
        type: 'photo',
        title: 'A moment on the journey',
        time: p.time,
        end_time: null,
        notes: '',
        lat: p.lat,
        lng: p.lng,
        tags: [],
        photos: [p],
        check_out: null,
        from_location: null,
        to_location: null,
        departure_timezone: null,
        arrival_timezone: null,
      }),
    );
    groups.forEach((group) => {
      if (!group?.length) return;
      entries.push({
        id: 2000 + group[0].id,
        day: date,
        type: 'cluster',
        title: `${group.length} photos`,
        time: group[0].time,
        end_time: group[group.length - 1].time,
        notes: '',
        lat: group[0].lat,
        lng: group[0].lng,
        tags: [],
        photos: group,
        check_out: null,
        from_location: null,
        to_location: null,
        departure_timezone: null,
        arrival_timezone: null,
      });
    });
    entries.sort((a, b) => a.time.localeCompare(b.time));
    return { date, title: titles[i], entries };
  });
  return JSON.parse(JSON.stringify({ title: trip.title, timezone: trip.timezone, days }));
}
