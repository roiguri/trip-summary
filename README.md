# WAYFARER: trip summary prototype

A Next.js trip journal on Firebase, with a fictional three-day Carmel/Monterey itinerary. The original Vite/localStorage proof of concept is archived in `legacy-vite/` for reference. No user's photos, location history, or travel details are stored in this repository.

## Run

Requires Node.js 22.18+ (uses the built-in `node:sqlite` module and runs the TypeScript scripts directly).

```sh
npm install
npm run emulators                                    # local Firebase (needs Java 21+), own terminal
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed  # the fictional sample trip
npm run dev                                          # http://localhost:3100
```

The app reads trips from Firebase (`docs/ARCHITECTURE.md`); in development and CI that is the Firebase emulators, never a real project. `npm run seed` stores the fictional sample (`data/sample-trip.json`, public sample imagery); `npm run seed -- --mocks` imports mock sources through the real importers and merge (`data/README.md`). Images are local copies of Wikimedia Commons media; see `public/photos/SOURCES.txt` for source URLs. Images are for illustrative review, and license terms should be checked before any public deployment.

## Interface

The timeline rail scrolls within a fixed viewport; the right-hand map and detail panel stay fixed. Places, lodging, transit, notes, single loose photos, photo clusters and day albums have detail views. The default map occupies 40% of the right column. `?map=small|current|large` previews 20%, 30%, 40%. The detail panel never scrolls: photo pages contain at most 12 images; smaller sets rebalance to fill the grid. `?arrows=a|b|c` previews gallery control styles for review. Clicking photos opens a fullscreen lightbox (Escape and arrow keys supported). The map uses MapLibre with OpenFreeMap's Liberty style and a paper-colored subset of its layers; map tiles require network access. Google Maps links use a stored URL when available, otherwise Google's coordinate search URL.

## Data contract

Trips come from three sources: the plan from the Jarvis travel database (its core tables `destinations`, `trips`, `places`, `itinerary` are mirrored in `lib/schema.ts`), the Android Timeline export, and photos from the Google Photos Picker. They are merged into a journal, with the owner's edits on top (`docs/DATA-DESIGN.md`). Times are read in the destination's time zone, not the browser's. No real trip data should be committed to this repository.

## Hosted preview

`npm run build && npm run start`, then `npm run snapshot` writes a static, relative-path copy of the page to `preview/` (git-ignored) for hosting as a private review page. Map tiles do not load there.

## Project docs

- `DESIGN.md` — locked visual decisions
- `docs/FIDELITY-CHECKLIST.md` and `docs/reference/` — reference mocks (`mock/`) and latest captures (`captures/`) from the design handoff
- `docs/ROADMAP.md` — planned phases and next steps

Interaction checks: with the app running, `npm run check:interactions` walks through selecting entries, map pins, day tracking, albums and the keyboard on the sample trip, and on a phone the timeline layout, the details sheet, the full-screen map and the menu.

CI (`.github/workflows/ci.yml`) runs on every pull request and push to `main`: `npm run format:check`, `npm run typecheck`, a production build of the seeded sample trip, `npm run check:interactions` and the visual regression tests (`npm run visual`, see `tests/visual/README.md`) against it.
