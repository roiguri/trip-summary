# WAYFARER: trip summary prototype

A local-only Next.js and SQLite prototype for a trip journal, with a fictional three-day Carmel/Monterey itinerary. The original Vite/localStorage proof of concept is archived in `legacy-vite/` for reference. No user's photos, location history, or travel details are stored in this repository.

## Run

Requires Node.js 22.5+ (uses the built-in `node:sqlite` module).

```sh
npm install
npm run dev
# http://localhost:3100
```

`npm run build && npm run start` serves the production build on port 3100. On first execution, `lib/data.ts` creates `trip-sample.db` and seeds only fictional trip entries and public sample imagery. SQLite files are git-ignored. Images are local copies of Wikimedia Commons media; see `public/photos/SOURCES.txt` for source URLs. This is a local prototype: images are for illustrative review, and license terms should be checked before any public deployment.

## Interface

The timeline rail scrolls within a fixed viewport; the right-hand map and detail panel stay fixed. Places, lodging, transit, notes, single loose photos, photo clusters and day albums have detail views. The default map occupies 40% of the right column. `?map=small|current|large` previews 20%, 30%, 40%. The detail panel never scrolls: photo pages contain at most 12 images; smaller sets rebalance to fill the grid. `?arrows=a|b|c` previews gallery control styles for review. Clicking photos opens a fullscreen lightbox (Escape and arrow keys supported). The map uses MapLibre with OpenFreeMap's Liberty style and a paper-colored subset of its layers; map tiles require network access. Google Maps links use a stored URL when available, otherwise Google's coordinate search URL.

## Data contract

The SQLite core tables `destinations`, `trips`, `places`, `wishlist`, `itinerary` mirror the supplied schema, including the `one_current_trip` index. A prototype-only `photos` table holds sample image references and photo coordinates. The current trip is selected by `is_current=1` and the timezone comes from `destinations.timezone`, not from the browser or a Denver fixture. This is an illustrative viewer, not yet a complete importer or editor. No real trip data should be committed to this repository.

## Project docs

- `DESIGN.md` — locked visual decisions
- `docs/FIDELITY-CHECKLIST.md` and `docs/reference/` — reference mocks (`mock/`) and latest captures (`captures/`) from the design handoff
- `docs/ROADMAP.md` — planned phases and next steps
