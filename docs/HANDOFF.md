# Handoff: verifying the real sources (on the owner's computer)

## Where things stand

- **Phase 0 is done**: the journey page was verified part by part against the mocks, refactored,
  and covered by CI (format, types, build, 34 interaction checks, 36 screenshot states).
- **Mobile is done**: one-column timeline under 1200px, phone layout under 900px (full-screen map,
  details sheet, swipeable photo viewer).
- **Phase 1 (data design) is agreed**: `docs/DATA-DESIGN.md`. In short: the plan comes from the
  Jarvis SQLite database and is the skeleton; the Android Timeline export (sliced to the trip in the
  browser) adds actual times and transit modes to the entries it matches, and everything else from it
  is a suggestion needing approval; photos and videos come from the Google Photos Picker and are
  copied into the app; all of it is editable in edit mode; a trip is a draft until published; editors
  are a Google allowlist and viewers an email allowlist with a one-time sign-in link.
- **Postponed by the user**: the top bar and a day scroller. Live options:
  https://claude.ai/artifact/V9Fa92HhY897rcKrsadNrw
- Hosted preview of the sample trip: https://claude.ai/artifact/SCUXjuqmaHh9TjeaXQ3MJH

## Why this session runs on the owner's computer

The data design rests on three sources that only exist on the owner's machines and accounts. Before
Phase 2 builds the importers, each one is checked for real, and the owner is guided through getting
access. Keep all real data outside the repo (for example in `~/wayfarer-data/`), and never commit it
or paste it into pull requests; only shapes and findings go into the docs.

## Next steps

1. **Jarvis database** (SQLite, everything entered by hand). Find the file, then run
   `node scripts/probe-sources.mjs --jarvis <path>`. Check that the tables and columns match
   `lib/schema.ts`'s core schema, and how many places have a `google_place_id` (visit matching relies
   on it; without it, matching falls back to distance and time).
2. **Timeline** (Android only). Guide the owner through Google Maps → Settings → Location → Timeline →
   Export, and moving `Timeline.json` to the computer privately. Run
   `node scripts/probe-sources.mjs --timeline <path>` and check the field names the importer will read:
   `semanticSegments`, `startTime`/`endTime`, the UTC offsets, `visit.topCandidate.placeId` and
   `semanticType`, `activity.topCandidate.type`, `distanceMeters`. Note the months covered (it spans
   years; the importer keeps only the trip's dates).
3. **Google Photos Picker** (since March 2025 the only way to read the owner's photos). Guide the
   owner through: a Google Cloud project; enabling the Photos Picker API; an OAuth consent screen in
   testing mode with their account as a test user; an OAuth client for a local web app; the scope
   `photospicker.mediaitems.readonly`. Keep the client ID and secret in `.env.local` (git-ignored).
   Then a small local test: create a picker session, open its `pickerUri`, pick a few photos and a
   video, poll the session, list the picked items, and download one photo and one video through the
   base URL. Record: which fields come back (time taken and its time zone? location? size?), how
   videos appear and download, and how long base URLs last.
4. **Update `docs/DATA-DESIGN.md`** with the findings (field names, matching fallback, thresholds,
   anything that changes the plan) and agree the changes with the owner.
5. **Then Phase 2**, as `docs/DATA-DESIGN.md` describes under "Building with mock data": mock
   sources shaped like the real ones, the importers, the merge with its tests, then a design round
   for edit mode before building its screens.
