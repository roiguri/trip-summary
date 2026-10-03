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

| Source       | What it gives                                                                                                                                                                        | How it arrives                                                                                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plan**     | The trip, its destination, places (with Google place IDs), and itinerary entries: places, lodging, transit, notes, tags. All entered by hand in Jarvis.                              | Jarvis's SQLite database file **(agreed)**. The importer reads one trip's rows by `trip_id`: the trip, its destination, its itinerary and the places they reference.                                             |
| **Timeline** | Visits (Google place ID, semantic type, start/end, location) and activities (mode such as `IN_PASSENGER_VEHICLE`, `WALKING`, `FLYING`; start/end; distance), with local UTC offsets. | The Android Timeline export (phone Settings → Location → Location services → Timeline → Export Timeline data, `Timeline.json` with `semanticSegments`) **(agreed: Android only)**. Sliced in the browser, below. |
| **Photos**   | Photos and videos chosen from Google Photos: stable media ID, time taken (UTC), size, and the file itself. No location (see below).                                                  | The Google Photos Picker API (since March 2025 apps can't read a whole library). Picker links expire after 60 minutes, so the app copies each picked photo into its own storage.                                 |

### Timeline slicing (agreed)

The export covers years. The import page reads the file in the browser, keeps only segments that
overlap the trip's dates plus one day on each side (in the trip's local time), and uploads only that
slice. The rest of the history never leaves the owner's device. `timelinePath`, `timelineMemory`,
`rawSignals` and `userLocationProfile` are dropped.

### Photos

For each trip the owner picks photos (typically one album) in Google's picker **(agreed)**. The
importer stores each photo's media ID (stable, used to avoid duplicates on re-pick), its time taken,
and copies of the image at display size (2048px) and thumbnail size (400px).

What the Picker gives, checked on the real API (see "Findings from the real sources"):

- **No location.** The API has no location field, and downloads have GPS stripped from EXIF. A
  photo's place always comes from the Timeline at the time it was taken (merge rule 6).
- **Time taken is UTC** (`createTime`). The local offset comes from the Timeline at that moment,
  else the destination's time zone. Google's resized copies are downloaded, not originals, so there
  is no EXIF offset to read **(decided Oct 3)**.
- **Files are reachable only with the owner's token**, through a base URL that Google documents as
  lasting 60 minutes, so the importer copies everything right after the pick. Photos download with
  `=d`, videos with `=dv` (a video can be tens of MB).

A Google Takeout export of the trip's album would give locations and captions too (per-file JSON
with `geoData`). It is not built; it is the fallback if Timeline placement proves too coarse
**(agreed)**.

## Three layers

The page is always computed from three layers; only the third is ever edited. They are described
below as tables; they are stored as Firestore documents (`docs/ARCHITECTURE.md`), with the same
fields and keys.

1. **Sources**: what each import brought, stored as-is per trip, replaced on re-import.
2. **Merge**: computed from the sources by fixed rules; never edited, rebuilt on each import.
3. **Edits**: the owner's decisions, keyed by stable IDs; never touched by an import.

### 1. Source tables

- **Plan tables**: the core schema (`destinations`, `trips`, `places`, `itinerary`) holds the
  imported plan with Jarvis's own IDs, so Jarvis's `entry_id` and `place_id` stay stable across
  re-imports. `wishlist` is not part of trip import.
- **`timeline_segments`**: trip, segment key (kind + start time + place ID or mode), kind (`visit` /
  `activity`), start and end (UTC), start and end UTC offsets, Google place ID, semantic type,
  probability, hierarchy level (a visit nested in a larger one, such as a shop in a mall), location
  (a visit's place; an activity's start and end), activity mode, distance. Locations arrive as
  `latLng` strings and are parsed into numbers on import.
- **`trip_photos`**: trip, Google media ID, kind (photo / video), time taken (UTC), local offset
  (from the Timeline at that moment, else the destination's time zone), size, MIME type,
  stored file paths.
- **`imports`**: one row per import: trip, source, when, by whom, a summary of what changed, and its
  state (`pending`, `applied`, `discarded`).

These replace the prototype `days` and `photos` tables.

### 2. Merge rules

1. **Days**: one per date from the trip's start to end, in local time. On days that cross time
   zones, each item's local time uses its own offset.
2. **Plan entries are the skeleton.** Every plan entry appears; nothing else appears unless approved.
3. **Visit → entry**: place IDs can be wrong on either side and planned times can be off, so
   neither decides alone **(agreed)**. A visit is a candidate for an entry on the same local day
   when it is within 150 m of the entry's place **or** shares its Google place ID. Among candidates,
   the one closest to the planned time wins, preferring the one that is both near and the same ID;
   a planned time is a hint, not a window. Each visit matches at most one entry. Nested visits (a
   shop inside a mall) are matched at any level; a nested visit inside a matched one is not a
   separate suggestion. The candidate and tie-break rules are **(proposed)**. **The Timeline changes
   no entry by itself (decided Oct 3, replacing "a matched entry shows the visit's actual times"):**
   a matched entry keeps its planned times, and the visit's actual times are a proposal the owner
   accepts or ignores in edit mode. Matching still decides where photos belong.
4. **Activity → transit**: an activity matches a transit entry when they overlap in time. Its
   mode and actual times (read at each end's own offset, which the plan usually lacks) are a
   proposal for edit mode, like a visit's times **(decided Oct 3)**; until accepted, the leg keeps
   its planned times and the mode guessed from its title.
5. **Unmatched visits and activities** become **suggestions**, shown only in edit mode, filtered to
   cut noise: visits of at least 15 minutes that aren't home or work, and activities over 2 km. A
   suggestion becomes an entry only when the owner approves it **(agreed)**.
6. **Photos**: a photo taken during a matched visit (with 15 minutes either side) attaches to that
   entry; any other photo is a **loose moment**, grouped with nearby photos by time gap (a new group
   after 45 minutes) **(agreed)**. A photo's map position is its visit's place; a photo taken during
   an activity is placed between the activity's start and end in proportion to the time; one with
   neither has no position and is shown without a pin **(proposed)**.
7. **Precedence**: edits, then the plan (names, notes, categories), then the Timeline (times, mode),
   then photos (attached to whatever the first three produce).
8. **Stays**: a stay keeps its booked check-in and check-out rather than the Timeline's times
   **(open: the owner isn't sure this is right; to discuss before edit mode)**. Coming back to the
   lodging on any day of the stay is part of the stay, never a suggestion **(proposed)**.

Distances and times above are starting values to tune on real data. On the owner's real trip,
150 m matched about two in five planned places, and 45 more had a visit the same day 150–500 m away;
the 2 km journey cutoff left over a hundred journey suggestions. Both are tuned in step 8.

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
- **Viewers**: each viewer gets a **personal invite link**, created in the app and sent by the owner
  however they like; there is no email service **(agreed)**. Opening it signs that browser in as
  that viewer, so no Google account is needed (a viewer may also sign in with Google). A link works
  for one browser, so a forwarded link gives nothing. Removing a viewer revokes only their access.
- Nothing is public. Photos are served only to signed-in users with access, through short-lived URLs.
- Stored: users (name, sign-in method), trip access (trip, user, role, added when, by whom), and
  invites (link, trip, viewer, created, used by which browser, revoked).

## Building with mock data (agreed)

- The sample trip is reshaped into the three sources: a mock Jarvis SQLite file, a mock Android
  `Timeline.json` (including segments outside the trip, to test slicing, and noise to test the
  filters), and mock Picker results with sample images.
- The importers and the merge are tested against these, including re-imports that keep edits.
- Sign-in has a development mode with mock users (an editor and a viewer).
- Development and tests run on the Firebase Emulator Suite, never the real project.

## Findings from the real sources

All three sources were checked on the owner's computer, without sharing the data:
`node scripts/probe-sources.mjs --jarvis <jarvis.db> --timeline <Timeline.json>` prints only their
shape, and the Picker was tried with a throwaway script. The real files live outside the repo.

- **Jarvis database**: tables and columns match the app's core schema exactly. About 90% of
  scheduled places and stays carry a Google place ID and coordinates. Most transit legs have no
  time zones, few stays have a check-out time, and few entries span more than one day.
- **Timeline**: every field the importer reads is present (`semanticSegments`, `startTime`/`endTime`,
  `start/endTimeTimezoneUtcOffsetMinutes`, `visit.topCandidate.placeId`/`semanticType`,
  `activity.topCandidate.type`, `distanceMeters`). The export spans years, so slicing is essential.
  Every visit has a place ID, but only about a third of the planned places appear among the trip's
  visits by ID: the IDs differ between Maps and the plan, which is why matching uses distance too.
  About a third of all segments have no UTC offset, but those are location traces (dropped): every
  visit and activity in the trip's slice has one. The importer still keeps a missing offset as
  null rather than guessing. Visits can be nested (`hierarchyLevel`). Locations are `latLng`
  strings. A `timelineMemory` kind exists and is ignored. Sliced to the trip, the real export
  shrinks from over 100 MB to under 200 KB.
- **Photos Picker**: works with one read-only scope (`photospicker.mediaitems.readonly`), an OAuth
  client for a web app, and the consent screen in testing mode. Items carry `id`, `createTime`
  (UTC), `type` (`PHOTO`/`VIDEO`) and `mediaFile` (`baseUrl`, `mimeType`, `filename`, width,
  height, camera, photo or video details with `processingStatus`). No location anywhere; EXIF keeps
  the time and its offset. Base URLs refuse requests without the token.

Thresholds (150 m, 15 minutes, 45 minutes, 2 km) remain starting values, tuned on the real trip in
Phase 2.

## Videos (agreed: from the start)

Videos picked with the photos are imported like photos: the importer stores the video file and a
still frame, matched and grouped by the time taken in the same way. The timeline and galleries show
the still with a play mark; the full-screen viewer plays the video. Video files are larger, so
storage and serving them (with the same access checks as photos) are part of the hosting decision.

## Order of the remaining design work

The open design questions don't change the data layer (it only stores, for example, that something is
highlighted), so they come after the importers and the merge are built against mock data, and
before the edit-mode screens: what a highlight looks like, the edit mode itself (suggestions, the
import review, moving photos), and then the top bar and day scroller (postponed, see the roadmap).
Hosting and storage are decided: `docs/ARCHITECTURE.md` (Netlify + Firebase).
