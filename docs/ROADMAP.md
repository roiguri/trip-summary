# WAYFARER roadmap

Starting point: the reconstructed prototype from the design handoff (Next.js 15 + React 19 + MapLibre, SQLite via `node:sqlite`, fictional Carmel/Monterey sample). The journey view is visually locked (see `DESIGN.md`, `docs/FIDELITY-CHECKLIST.md`, and the screenshots in `docs/reference/`). Everything below is proposed; each round is approved before it lands, per `DESIGN.md`.

## Where things stand

| Area | State |
| --- | --- |
| Journey timeline, map, detail panel, lightbox | Done, visually locked against the references |
| Wishlist / Places tabs | Header links only, no screens |
| Data | SQLite schema + fictional seed in `lib/data.ts`; read-only |
| Import (Google Maps Timeline, Google Photos, notes) | Parsers exist only in `legacy-vite/` (localStorage prototype), not wired into the Next app |
| Editing / review (highlights, recommendations) | Not started |
| Auth / deployment | Not configured ("View-only demo"); no deploy without a separate decision |
| Tooling | No lint, formatter, tests or CI |

Known issues found while initializing:

- `/` is prerendered as static, so the trip is read from SQLite at **build** time. Any real data flow needs the page to be dynamic (`export const dynamic = 'force-dynamic'` or server actions/route handlers).
- `app/Client.tsx`, `lib/data.ts` and `app/globals.css` are written in a dense, near-minified style (a few very long lines). Hard to review and diff.
- Remaining visual gaps from the handoff: substitute photos don't match captions; the multi-day end bend is subtler than the reference; the font is inferred (Arial/Helvetica), not proven.
- Sample photos are Wikimedia Commons copies; licenses need checking before any public deployment.

## Phase 0 — Foundation (no visual change)

1. Reformat the code base (Prettier) and split `Client.tsx` into components: `Header`, `Timeline` (+ entry kinds: place, lodging, transit, note, photo, cluster, multi-day span), `MapCard`, `DetailPanel`, `Gallery`, `Lightbox`.
2. Split `lib/data.ts` into `schema.sql`/migrations, a seed script, and typed query functions.
3. Add ESLint, Prettier, `npm run typecheck`, and a GitHub Actions CI job (install, typecheck, lint, build).
4. Visual regression guard: Playwright screenshots of the locked states at 1440×900, compared against committed baselines (the existing `docs/reference/captures/` set is the target). This protects the locked design during refactors.
5. Pin Node (`.nvmrc` / `engines` ≥ 22.5).

## Phase 1 — Real data in (local only)

1. Port the legacy importers (`legacy-vite/src/lib/importers/*`) into `lib/importers/`, retargeted to the SQLite schema (`places`, `itinerary`, `photos`). Unit tests with small synthetic fixtures.
2. Timeline builder: group by day in the destination timezone, merge photos into place visits by time/location, derive clusters and loose photos, detect transit from activity segments.
3. Import UI (or CLI first: `npm run import -- --timeline file.json --photos dir/`), writing to a git-ignored DB. Local photo files served from a git-ignored folder.
4. Make the page dynamic so it reflects the DB at request time.
5. Keep the hard rule: no real trip data or photos in the repo.

## Phase 2 — Review & edit

- Mark highlights, favorite photos, edit notes/recommendations, rename/merge/reorder entries, fix categories.
- Trip picker (the schema already supports multiple trips with one `is_current`).
- Export/backup (JSON), matching the legacy export format where useful.

## Phase 3 — Remaining screens

- **Places**: by-category view (legacy `CategoryView.tsx` is a starting point), map-first.
- **Wishlist**: backed by the existing `wishlist` table, with done/priority.
- Responsive/mobile layout (the locked design is desktop 1440×900 only).

## Phase 4 — Sharing & deployment (needs a separate decision)

- Hosting choice (SQLite on a single node vs. hosted DB), auth, and read-only share links.
- Photo storage strategy (local files vs. object storage), and media licensing review.

## Suggested immediate next step

Phase 0, items 1–4: refactor + tooling + screenshot guard, landed as one reviewed PR with no visual diff. Then start Phase 1 with the Google Maps Timeline importer.
