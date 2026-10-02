# Data design (Phase 1)

How a real trip gets into the app: where the data comes from, how the sources merge into the journal,
how the owner curates it, and who can see it. Agreed decisions are marked **(agreed)**; the rest is
**(proposed)** until reviewed. Nothing here is built yet; Phase 2 builds it against mock data.

## Goals

- A new trip can be added at any time: its plan from Jarvis, its Timeline and its photos are loaded
  and merged into the journal the app already draws.
- The plan is the skeleton **(agreed)**. Other sources only enrich it; nothing is added to the plan
  without the owner's approval **(agreed)**.
- Everything shown is controllable in edit mode: hide, highlight, rename, re-caption, move **(agreed)**.
- Edits survive every re-import.
- Real data never enters the repo. Development and tests use mock data **(agreed)**; the real app is
  behind sign-in **(agreed)**.

## Sources

| Source       | What it gives                                                                                                                                                                        | How it arrives                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plan**     | The trip, its destination, places (with Google place IDs), and itinerary entries: places, lodging, transit, notes, tags. All entered by hand in Jarvis.                              | Jarvis's SQLite database file **(agreed)**. The importer reads one trip's rows by `trip_id`: the trip, its destination, its itinerary and the places they reference.                   |
| **Timeline** | Visits (Google place ID, semantic type, start/end, location) and activities (mode such as `IN_PASSENGER_VEHICLE`, `WALKING`, `FLYING`; start/end; distance), with local UTC offsets. | The Android Timeline export (Google Maps → Settings → Location → Timeline → Export, `Timeline.json` with `semanticSegments`) **(agreed: Android only)**. Sliced in the browser, below. |
| **Photos**   | Photos chosen from Google Photos: stable media ID, time taken, size, and the image itself.                                                                                           | The Google Photos Picker API (since March 2025 apps can't read a whole library). Picker links expire after 60 minutes, so the app copies each picked photo into its own storage.       |

### Timeline slicing (agreed)

The export covers years. The import page reads the file in the browser, keeps only segments that
overlap the trip's dates plus one day on each side (in the trip's local time), and uploads only that
slice. The rest of the history never leaves the owner's device. `timelinePath`, `rawSignals` and
`userLocationProfile` are dropped.

### Photos

For each trip the owner picks photos (typically one album) in Google's picker. The importer stores
each photo's media ID (stable, used to avoid duplicates on re-pick), its time taken, and copies of
the image at display size (2048px) and thumbnail size (400px). Location data is removed from the
stored copies. If the Picker turns out to give a photo's location, it is kept in the database only;
otherwise a photo's place comes from the Timeline at the time it was taken.

## Three layers

The page is always computed from three layers; only the third is ever edited.

1. **Sources**: what each import brought, stored as-is per trip, replaced on re-import.
2. **Merge**: computed from the sources by fixed rules; never edited, rebuilt on each import.
3. **Edits**: the owner's decisions, keyed by stable IDs; never touched by an import.

### 1. Source tables

- **Plan tables**: the core schema (`destinations`, `trips`, `places`, `itinerary`) holds the
  imported plan with Jarvis's own IDs, so Jarvis's `entry_id` and `place_id` stay stable across
  re-imports. `wishlist` is not part of trip import.
- **`timeline_segments`**: trip, segment key (kind + start time + place ID or mode), kind (`visit` /
  `activity`), start and end (UTC), start and end UTC offsets, Google place ID, semantic type,
  probability, location, activity mode, distance.
- **`trip_photos`**: trip, Google media ID, time taken (UTC), local offset (from the Timeline at that
  moment, else the destination's time zone), size, MIME type, stored file paths.
- **`imports`**: one row per import: trip, source, when, by whom, a summary of what changed, and its
  state (`pending`, `applied`, `discarded`).

These replace the prototype `days` and `photos` tables.

### 2. Merge rules

1. **Days**: one per date from the trip's start to end, in local time. On days that cross time
   zones, each item's local time uses its own offset.
2. **Plan entries are the skeleton.** Every plan entry appears; nothing else appears unless approved.
3. **Visit → entry**: a Timeline visit matches a plan entry when they share a Google place ID, or
   failing that when the visit is within 150 m of the entry's place and overlaps its planned day
   (and time, if planned). A matched entry shows the visit's actual times **(agreed)**; an entry
   without a match keeps its planned times.
4. **Activity → transit**: an activity matches a transit entry when they overlap in time. It sets
   the transit mode (replacing today's guess from the title) and the actual times.
5. **Unmatched visits and activities** become **suggestions**, shown only in edit mode, filtered to
   cut noise: visits of at least 15 minutes that aren't home or work, and activities over 2 km. A
   suggestion becomes an entry only when the owner approves it **(agreed)**.
6. **Photos**: a photo taken during a matched visit (with 15 minutes either side) attaches to that
   entry; any other photo is a **loose moment**, grouped with nearby photos by time gap (a new group
   after 45 minutes) **(agreed)**.
7. **Precedence**: edits, then the plan (names, notes, categories), then the Timeline (times, mode),
   then photos (attached to whatever the first three produce).

Distances and times above are starting values to tune on real data.

### 3. Edits

One table, **`edits`**: trip, target kind (`trip`, `day`, `entry`, `place`, `photo`, `suggestion`),
target key, field, value, when, by whom. Target keys are stable: Jarvis `entry_id` and `place_id`,
Google place ID, Timeline segment key, Google media ID, date for a day.

What can be edited, for everything shown **(agreed)**:

- **Hide** / **highlight** any entry, place, photo or day. Highlighting a photo makes it the entry's
  or day's cover; highlighting an entry gives it a mark on the timeline (exact look to design).
- **Text**: titles, notes, captions, day titles, the trip's subtitle.
- **Times**: override an entry's shown times (for example, keep the planned time instead of the
  Timeline's).
- **Photos**: attach a loose photo to any entry or place, detach it, or move it between entries
  **(agreed)**.
- **Suggestions**: approve (it becomes an entry) or dismiss.

An edit whose target disappears from its source (for example, an entry deleted in Jarvis) is kept
and listed in edit mode as "refers to something no longer in the plan", never silently dropped.

## Import and publishing (agreed)

1. The owner creates a trip by importing its plan from the Jarvis database file and picking the trip.
2. Adds the Timeline slice and picks the photos, in any order and as often as needed.
3. Each import shows a review: what was added, changed or removed; new suggestions; unmatched photos.
   Applying it rebuilds the merge and re-applies the edits.
4. A new trip is a **draft**, visible only to editors, until the owner publishes it.
5. After publishing, edits go live immediately. A re-import stays a pending review and changes the
   published trip only when applied.

## Access (agreed)

- **Editors**: an allowlist of Google accounts per trip, signing in with Google (which the photo
  import needs anyway).
- **Viewers**: an allowlist of email addresses per trip. A viewer signs in with a one-time sign-in
  link emailed to them (or with Google), so no Google account is needed. Adding a viewer sends them
  an invite; a forwarded invite gives nothing to anyone not on the list. Removing a viewer revokes
  only their access.
- Nothing is public. Photos are served only to signed-in users with access, through short-lived URLs.
- Tables: `users` (email, name, sign-in method), `trip_access` (trip, email, role, added when, by whom).

## Building with mock data (agreed)

- The sample trip is reshaped into the three sources: a mock Jarvis SQLite file, a mock Android
  `Timeline.json` (including segments outside the trip, to test slicing, and noise to test the
  filters), and mock Picker results with sample images.
- The importers and the merge are tested against these, including re-imports that keep edits.
- Sign-in has a development mode with mock users (an editor and a viewer).

## Verifying the real sources before agreeing

Two sources are checked against the real data before this design is agreed, without sharing the data:
`node scripts/probe-sources.mjs --jarvis <jarvis.db> --timeline <Timeline.json>` prints only their
shape (tables and columns compared with the app's schema, counts, how much is filled in, Timeline
field names, segment kinds and modes, months covered); no names, notes, coordinates or place IDs.
It checks in particular:

- that Jarvis's tables and columns match the app's core schema;
- how many places have a Google place ID (visit matching relies on it; without it, matching falls
  back to distance and time);
- the Android `Timeline.json` structure and field names the importer will read.

The Photos Picker (whether it gives a photo's location and time zone) is checked at the start of
Phase 2, as it needs a Google Cloud project and OAuth setup; the design works either way.

## Videos (proposed)

Videos picked with the photos are recorded and shown as a still frame at first; playing them comes
later.

## Order of the remaining design work

The open design questions don't change the data layer (it only stores, for example, that something is
highlighted), so they come after the importers and the merge are built against mock data, and
before the edit-mode screens: what a highlight looks like, the edit mode itself (suggestions, the
import review, moving photos), and then the top bar and day scroller (postponed, see the roadmap).
Hosting and photo storage (Phase 6) must be decided before anything real goes online.
