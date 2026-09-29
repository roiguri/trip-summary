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
4. Refactor behind the guard: split `Client.tsx` into components (`Header`, `Timeline` + entry kinds, `MapCard`, `DetailPanel`, `Gallery`, `Lightbox`). Split `lib/data.ts` into schema, seed and typed queries. Remove sample-only hard-coding found during verification. No visual diff.

## Phase 1 — Real data: discovery and design (its own step, no build yet)

Real data integration is complex enough to be designed and agreed on before any code. Topics to work through together:

- **Sources:** which exports we actually have and in which format (Google Maps Timeline on-device vs. Takeout; Google Photos Takeout vs. API; the planning/notes format; bookings/transit). We'll gather small anonymised samples, and none go into the repo.
- **Model:** the core schema (`destinations`, `trips`, `places`, `wishlist`, `itinerary`) is the user's real one, so changes to it are deliberate and designed here. Open points found in Phase 0: a permanent home for day titles and photos (now prototype tables), photo captions and their source, a transport mode for transit legs (now derived from the title), and how loose photos are grouped (groups are derived today, so they can't have their own caption; captions are per photo). What is imported vs. authored vs. derived.
- **Pipeline:** matching photos to places (time and location), clustering loose photos, timezone handling, deduplication, re-import without losing edits.
- **Storage and privacy:** where the DB and photo files live, what's git-ignored, thumbnails.
- **UX:** import flow (CLI first vs. in-app), and how review/editing corrections feed back.

Output: a written data design, agreed before Phase 2.

## Phase 2 — Real data: implementation

Build what Phase 1 agreed: the importers (porting `legacy-vite/src/lib/importers/*` where it still fits), the timeline builder, the import flow, and a page that reads the DB per request. Fixture-based tests. Hard rule: no real trip data or photos in the repo.

## Phase 3 — Review and editing

- Mark highlights, favorite photos, edit notes/recommendations and photo captions, rename/merge/reorder entries, fix categories.
- Trip picker (the schema already supports multiple trips with one `is_current`).
- Export/backup.

## Phase 4 — Mobile: design (its own step)

Nothing has been discussed or designed for mobile yet; the locked design is desktop (1440×900) only. First decide together:

- Which uses matter on a phone (browsing a finished trip, logging during the trip, sharing).
- How the rail + map + detail layout translates (e.g. map as sheet/toggle, detail as full-screen sheet, rail single-sided).
- Mocks for the key screens, agreed the same part-by-part way as Phase 0.

Then implementation as its own step.

## Phase 5 — Remaining screens

- **Places:** by-category view (legacy `CategoryView.tsx` is a starting point), map-first.
- **Wishlist:** backed by the existing `wishlist` table, with done/priority.
- Each needs its own design pass. There are no mocks for either today.

## Phase 6 — Sharing and deployment (needs a separate decision)

- Hosting choice (SQLite on a single node vs. hosted DB), auth, and read-only share links.
- Photo storage strategy (local files vs. object storage), and media licensing review.

## Immediate next step

Phase 0, item 1: walk through verification part 1 (page shell and scroll model) and agree on it.
