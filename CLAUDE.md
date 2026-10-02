# WAYFARER trip journal

A trip journal: a timeline of each day (places, stays, transit, notes, photos) beside a map and a
detail card, with a phone layout. Next.js 15 (app router), React 19, MapLibre (OpenFreeMap tiles),
SQLite through `node:sqlite`. The page reads the current trip from the database on every request.

**Where things stand and what's next: read `docs/HANDOFF.md` first.**

## Commands

```sh
npm run seed                 # load data/sample-trip.json into trip-sample.db ($TRIP_DB selects another file)
npm run dev                  # dev server on 3100
npm run build && npm run start
npm run format:check && npm run typecheck
BASE_URL=http://localhost:3100 npm run check:interactions   # 34 interaction checks (desktop + phone)
BASE_URL=http://localhost:3100 npm run visual               # 36 screenshot states vs tests/visual/baseline
npm run visual:update        # only for an intended visual change; it also rewrites unchanged baselines
                             # with anti-aliasing noise, so commit only the states that changed
npm run check:styles         # computed-style diff between two builds (BASE_A, BASE_B), for refactors
node scripts/probe-sources.mjs --jarvis <db> --timeline <Timeline.json>   # shape of real sources only
```

CI (`.github/workflows/ci.yml`) runs format, types, build, interaction checks and visual tests.

## Map of the code and docs

- `app/Client.tsx` holds shared state; parts live in `app/components/` (Timeline, MapCard, MapView,
  DetailPanel, Lightbox, PhoneMap, PhoneSheet, Header). `app/globals.css` is written by component,
  each style once; narrow layouts are at the end (one column under 1200px, phone under 900px).
- `lib/data.ts` builds the trip model from the database; `lib/schema.ts` is the schema (core tables
  are the user's real schema; `days` and `photos` are prototype tables to be replaced, see
  `docs/DATA-DESIGN.md`).
- `docs/ROADMAP.md` (phases), `docs/ARCHITECTURE.md` (hosting, store, sign-in), `docs/DATA-DESIGN.md` (agreed data design), `docs/VERIFICATION.md`
  and `DESIGN.md` (every agreed UI decision), `data/README.md` (trip file format),
  `tests/visual/README.md` (visual and style tests).

## Working conventions

- Design first: options are drawn (as preview pages) and agreed with the user before building, and
  every agreed decision is written into `docs/VERIFICATION.md`, `DESIGN.md` or `DATA-DESIGN.md`.
- One pull request per unit of work, squash-merged into `main` when the user approves.
- A change that shouldn't alter the look must pass the visual tests unchanged; desktop (1440px) is
  the locked design.
- Never commit real trip data, photos, Timeline exports, credentials or probe output that contains
  personal data. Real files live outside the repo; `.env*` and `*.db` are git-ignored.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
