# WAYFARER roadmap

Starting point: the reconstructed prototype from the design handoff (Next.js 15 + React 19 + MapLibre, SQLite via `node:sqlite`, fictional Carmel/Monterey sample). The journey view is visually locked (see `DESIGN.md`, `docs/FIDELITY-CHECKLIST.md`, and the screenshots in `docs/reference/`). Everything below is proposed; each round is approved before it lands, per `DESIGN.md`.

## Where things stand

| Area                                                | State                                                                                         |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Journey timeline, map, detail panel, lightbox       | Done, visually locked against the references                                                  |
| Wishlist / Places tabs                              | Header links only, no screens                                                                 |
| Data                                                | SQLite schema + fictional seed in `lib/data.ts`; read-only                                    |
| Import (Google Maps Timeline, Google Photos, notes) | Parsers exist only in `legacy-vite/` (localStorage prototype), not wired into the Next app    |
| Editing / review (highlights, recommendations)      | Not started                                                                                   |
| Auth / deployment                                   | Not configured ("View-only demo"); no deploy without a separate decision                      |
| Tooling                                             | Prettier, typecheck, interaction checks and GitHub Actions CI; ESLint pending registry access |

Known issues found while initializing:

- `/` is prerendered as static, so the trip is read from SQLite at **build** time. Any real data flow needs the page to be dynamic (`export const dynamic = 'force-dynamic'` or server actions/route handlers).
- Remaining visual gaps from the handoff: substitute photos don't match captions; the multi-day end bend is subtler than the reference; the font is inferred (Arial/Helvetica), not proven.
- Sample photos are Wikimedia Commons copies; licenses need checking before any public deployment.

## Phase 0 — Foundation and fidelity verification (no visual change unless agreed)

1. **Verify the implementation against the mocks, part by part** (`docs/VERIFICATION.md`). Each of the 13 parts is reviewed side by side (mock, handoff capture, current capture) and agreed before moving on. Fixes that come out of a part are small, reviewed changes. Progress: all 13 parts agreed; data separation done; a measured mock style pass (header, timeline, photo cards, right column, content-sized detail card) done; Part 7 (multi-day spans, lanes) done and hotel stays designed and built. Parts 3–6 and 8–13 still need their review.
2. Tooling: Prettier (done, checked in CI), `npm run typecheck` (done), Node pinned (`engines`, done), a GitHub Actions CI job running format, types, build and the interaction checks on every PR (done). ESLint waits for npm registry access (it needs new packages and a lockfile update).
3. Screenshot guard: `npm run visual` compares 22 agreed states with committed baselines in `tests/visual` and runs in CI (done).
4. Refactor behind the guard: split `Client.tsx` into components (done: `Header`, `Timeline`, `MapCard`/`MapView`, `DetailPanel`, `Lightbox`); rewrite `app/globals.css` by component with each style defined once, checked with `npm run check:styles` (done). Split `lib/data.ts` into schema, seed and typed queries. Remove sample-only hard-coding found during verification. No visual diff.

## Phase 1 — Real data: discovery and design (its own step, no build yet)

Real data integration is complex enough to be designed and agreed on before any code. Topics to work through together:

- **Sources:** which exports we actually have and in which format (Google Maps Timeline on-device vs. Takeout; Google Photos Takeout vs. API; the planning/notes format; bookings/transit). We'll gather small anonymised samples, and none go into the repo.
- **Model:** the core schema (`destinations`, `trips`, `places`, `wishlist`, `itinerary`) is the user's real one, so changes to it are deliberate and designed here. Open points found in Phase 0: a permanent home for day titles and photos (now prototype tables), photo captions and their source, a transport mode for transit legs (now derived from the title), and how loose photos are grouped (groups are derived today, so they can't have their own caption; captions are per photo). What is imported vs. authored vs. derived.
- **Pipeline:** matching photos to places (time and location), clustering loose photos, timezone handling, deduplication, re-import without losing edits.
- **Storage and privacy:** where the DB and photo files live, what's git-ignored, thumbnails.
- **UX:** import flow (CLI first vs. in-app), and how review/editing corrections feed back.

Output: a written data design, agreed before Phase 2: `docs/DATA-DESIGN.md` (agreed), verified against the real sources on the owner's computer.

## Phase 2 — Real data: implementation

Build what Phase 1 agreed, on the store `docs/ARCHITECTURE.md` decided (Netlify + Firebase). Hard rule: no real trip data or photos in the repo. One pull request per step:

0. Architecture decision (`docs/ARCHITECTURE.md`): done.
1. Done: mock sources shaped like the real ones (Jarvis database, `Timeline.json`, Picker results), and the Node `engines` fix.
2. Done: data model on Firestore behind `lib/store/`, with the emulator for development and tests.
3. Done: plan importer (Jarvis SQLite file).
4. Done: Timeline importer (slice, parse, store).
5. Done: the merge, with a test per rule, and the page reading the merged journal from the store. The sample is stored as a ready-made journal and the visual tests pass unchanged through the store; a real import changes what is drawn on purpose (actual times, photos grouped by time gaps), so the merge is checked by its tests and, in step 8, on the real trip.
6. Done: design round, with preview pages: the home page (trips list), adding a new trip, the import flow and its review, drafts and publishing.
7. Done: those screens, with sign-in and access (Google for editors, personal invite links for viewers), the home page, the import page with its review, the editors' bar (publish, share, preview), and the photo import (Picker, copying in the app, `/media`).
8. Import the owner's real trip into a private draft and tune the matching, reviewed together.

Then the edit-mode design round.

## Phase 3 — Review and editing

- Mark highlights, favorite photos, edit notes/recommendations and photo captions, rename/merge/reorder entries, fix categories.
- Trip picker (the schema already supports multiple trips with one `is_current`).
- Export/backup.

## Phase 4 — Mobile

Designed with mock options and agreed (`docs/VERIFICATION.md`, "Mobile"): a one-column timeline, a full-screen map with every day in one row, and a details sheet. Built: the phone layout (under 900px), the one-column timeline with a narrower right column from 900 to 1199px, and a swipeable photo viewer.

## Phase 5 — Remaining screens

- **Places:** by-category view (legacy `CategoryView.tsx` is a starting point), map-first.
- **Wishlist:** backed by the existing `wishlist` table, with done/priority.
- Each needs its own design pass. There are no mocks for either today.

## Phase 6 — Sharing and deployment

- Hosting, storage and sign-in are decided (`docs/ARCHITECTURE.md`): Netlify + Firebase, editors with Google, viewers with personal invite links.
- Left for this phase: the production Firebase project and Netlify site, the budget alert, and a media licensing review of the sample photos.

## Enhancements (after the phases above)

- **A map of all trips**: a map view of every trip, as a second way to browse the home page (user decision, Oct 2: nice to have, at the end of the plan).

## Immediate next step

Phase 2, step 8: the owner tries the built app by hand (the Google sign-in popup, a real Google Photos pick, the new pages), then their real trip is imported into a private draft and the matching is tuned together. Open: whether a stay shows its booked check-in and check-out or the Timeline's times (`docs/DATA-DESIGN.md`, merge rule 8), to discuss before edit mode.

Postponed (user decision, to return to later): the top bar (style, mark, name) and a ChatGPT-style day scroller. Live options for both, with recommendations, are on the options page: https://claude.ai/artifact/V9Fa92HhY897rcKrsadNrw
