// Core tables mirror the supplied schema (including the one_current_trip index).
export const CORE_SCHEMA = `
CREATE TABLE IF NOT EXISTS destinations (destination_id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL COLLATE NOCASE UNIQUE,kind TEXT CHECK(kind IN ('city','region','country')),country TEXT,timezone TEXT NOT NULL,lat REAL,lng REAL,google_locality TEXT,created_at DATETIME DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS trips (trip_id TEXT PRIMARY KEY,title TEXT,destination_id INTEGER NOT NULL REFERENCES destinations(destination_id),start_date DATE,end_date DATE,status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','archived')),is_current INTEGER NOT NULL DEFAULT 0,notes TEXT,created_at DATETIME DEFAULT (datetime('now')),CHECK(end_date IS NULL OR start_date IS NULL OR end_date>=start_date));
CREATE UNIQUE INDEX IF NOT EXISTS one_current_trip ON trips(is_current) WHERE is_current=1;
CREATE TABLE IF NOT EXISTS places (place_id INTEGER PRIMARY KEY AUTOINCREMENT,google_place_id TEXT UNIQUE,destination_id INTEGER NOT NULL REFERENCES destinations(destination_id),title TEXT NOT NULL,address TEXT,maps_url TEXT,lat REAL,lng REAL,category TEXT,google_type TEXT,google_type_label TEXT,google_types TEXT,city TEXT,country TEXT,created_at DATETIME DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS places_by_destination ON places(destination_id);
CREATE TABLE IF NOT EXISTS wishlist (wishlist_id INTEGER PRIMARY KEY AUTOINCREMENT,destination_id INTEGER NOT NULL REFERENCES destinations(destination_id),place_id INTEGER REFERENCES places(place_id),title TEXT,city TEXT,notes TEXT,priority INTEGER DEFAULT 3 CHECK(priority BETWEEN 1 AND 5),done_at DATE,added_at DATETIME DEFAULT (datetime('now')),UNIQUE(destination_id,place_id),UNIQUE(destination_id,title),CHECK(place_id IS NOT NULL OR title IS NOT NULL));
CREATE INDEX IF NOT EXISTS wishlist_by_destination ON wishlist(destination_id);
CREATE TABLE IF NOT EXISTS itinerary (entry_id INTEGER PRIMARY KEY AUTOINCREMENT,trip_id TEXT NOT NULL REFERENCES trips(trip_id),place_id INTEGER REFERENCES places(place_id),item_type TEXT NOT NULL CHECK(item_type IN ('place','lodging','transit','note','tag')),title TEXT,start_date DATE NOT NULL,end_date DATE,start_time TEXT,end_time TEXT,departure_timezone TEXT,arrival_timezone TEXT,from_location TEXT,to_location TEXT,confirmation_code TEXT,notes TEXT,created_at DATETIME DEFAULT (datetime('now')),CHECK(place_id IS NOT NULL OR title IS NOT NULL),CHECK(end_date IS NULL OR end_date>=start_date),CHECK(item_type='lodging' OR start_time IS NOT NULL OR end_time IS NULL));
CREATE INDEX IF NOT EXISTS itinerary_by_trip_date ON itinerary(trip_id,start_date);
`;

// Prototype-only tables: day titles and photo references are not part of the supplied schema yet.
export const PROTOTYPE_SCHEMA = `
CREATE TABLE IF NOT EXISTS days (trip_id TEXT NOT NULL REFERENCES trips(trip_id),date DATE NOT NULL,title TEXT,PRIMARY KEY(trip_id,date));
CREATE TABLE IF NOT EXISTS photos (photo_id INTEGER PRIMARY KEY AUTOINCREMENT,trip_id TEXT NOT NULL REFERENCES trips(trip_id),entry_id INTEGER REFERENCES itinerary(entry_id),date TEXT NOT NULL,time TEXT NOT NULL,url TEXT NOT NULL,caption TEXT NOT NULL,latitude REAL,longitude REAL);
CREATE INDEX IF NOT EXISTS photos_by_trip_date ON photos(trip_id,date,time);
`;
