# Fidelity verification against the mocks

Phase 0 goal: confirm that the prototype is implemented correctly against the reference mocks, one part at a time, and agree on each part before moving on. Nothing is refactored until its part is agreed, so the refactor has a known-good target.

## How we verify

- **Current state:** `npm run build && npm run start`, then `npm run capture <dir>` saves every state at 1440×900 (`scripts/capture.mjs`).
- **Targets:** `docs/reference/mock/` (original mocks) and `docs/reference/captures/` (the handoff's "locked" captures of this code). The handoff captures show what the code does. The mocks show what was designed. Where they differ, the part review decides.
- **Precedence:** where a mock conflicts with a later written decision in `DESIGN.md` (e.g. the Sept 26 "two-track rail throughout" correction), the written decision wins unless we agree otherwise.
- **Two kinds of check per part:**
  1. _Visual_: does it look like the reference?
  2. _Behavioural/data_: is it driven by the data, or faked for the sample? A part that looks right but is hard-coded is not done.
- **Map tiles:** OpenFreeMap is blocked in the cloud dev environment, so map captures there show markers on an empty background. Tile styling is verified locally.
- **Data decoupling (applies to every part):** the UI must contain no trip-specific values. Everything it shows comes from the trip model, and the sample is just one data set. A part isn't agreed while it still depends on sample IDs, names, dates or counts in code.
- Per part status: `pending` → `in review` → `agreed` (or `agreed with changes`, listing the changes).

## Parts

| #   | Part                                                                                   | References                                                                                       | Status  |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------- |
| 1   | Page shell: header, intro, scroll model, backgrounds                                   | `mock/app-locked-geometry-final-full`, `mock/image-e55ca7ac`, `captures/wayfarer-locked-opening` | pending |
| 2   | Rail and day banners (two-track rail, day tag)                                         | geometry mock, `captures/wayfarer-locked-rail-*`                                                 | pending |
| 3   | Place / lodging entries (connector, title, byline, photo fan)                          | geometry mock, `mock/roi-shot-cards`                                                             | pending |
| 4   | Loose photo and cluster entries                                                        | `mock/roi-shot-cards`, `captures/wayfarer-photo-cards-compare-*`                                 | pending |
| 5   | Transit stop                                                                           | `mock/transit-locked-zoom`, `captures/wayfarer-transit-rail-compare-*`                           | pending |
| 6   | Notes (tape, LTR/RTL)                                                                  | geometry mock, `captures/wayfarer-locked-notes`                                                  | pending |
| 7   | Multi-day span (start block, day chips, dot lane, end diamond)                         | geometry mock, `captures/wayfarer-locked-multiday-end`                                           | pending |
| 8   | Map card (layout, ratios, markers, route, Whole trip, day emphasis)                    | `mock/trip-real-map-whole-final`, `mock/trip-real-map-day-final`, `mock/panel-ratio-large`       | pending |
| 9   | Detail panel: place and lodging                                                        | `mock/panel-final-place`, `captures/wayfarer-locked-place`                                       | pending |
| 10  | Detail panel: photo, cluster, day album, gallery and pager                             | `mock/image-e55ca7ac`, `captures/wayfarer-locked-single`, `-cluster`, `-pager`                   | pending |
| 11  | Lightbox                                                                               | `captures/wayfarer-locked-fullscreen`                                                            | pending |
| 12  | Collapsed right column                                                                 | no reference image; written spec in `DESIGN.md` only                                             | pending |
| 13  | Interactions: click-to-scroll, day tracking while scrolling, map pin → entry, keyboard | written spec in `DESIGN.md`                                                                      | pending |

## Part decisions

### Part 1: Page shell (agreed with changes)

- The intro scrolls away with the timeline, as in the mock. `.left` is now the single scroll container, and the rail uses the full height under the header once scrolled.
- The title comes from `trips.title` and the subtitle from `trips.notes`, followed by the destination timezone.
- Clicking an entry now scrolls to it; this fixes the P13 scroll bug as a side effect.
- Not changed: the "03 / THE JOURNEY" kicker is navigation chrome, not trip data. The map-card title ("Coastal detour") is handled in Part 8.

## Preliminary findings (to be confirmed per part)

Things noticed during the first capture pass. Each gets decided in its part's review.

- ~~**P1 (scroll model):** in the mocks the trip title block scrolls away with the timeline, and the rail uses the full height under the header. In the code the intro is pinned and the rail scrolls in a window that starts at y≈282. The handoff captures show the code's behaviour, so the handoff did not flag it.~~ Fixed in Part 1.
- ~~**P1:** the intro title, kicker ("03 / THE JOURNEY") and subtitle are hard-coded strings, not the trip's title.~~ Fixed in Part 1.
- **P2:** every day banner shows a hard-coded `Coast` tag. Day titles and dates are hard-coded in `lib/data.ts` (`dates`, `titles`), not derived from the trip.
- **P2 vs mock:** the mock shows the dotted lane only during a multi-day span. The code shows it along the whole rail, per the later "two-track throughout" decision. Needs confirming.
- **P3:** lodging check-out is the hard-coded string `2026-05-17 · 11:00`. Place tags fall back to `Walk` for missing categories.
- **P7:** the multi-day span is keyed to `entry_id === 12`. The chip text ("Coast Path Walk · day N") and the end label ("15:40 · END") are literal strings in `Client.tsx`. The span's photos are borrowed from Carmel Beach (entry 1), so the day album counts them twice (Day 1 shows 30 photos; there are 27).
- **P8:** map bounds, the initial centre, "3 DAYS" and the timezone label `PT` are hard-coded for the sample.
- **P10:** the pager footer says "1 PHOTOS" for a single photo (no singular form).
- **P10:** the photo-sequence panel in `mock/image-e55ca7ac` has an eyebrow and a date; these were removed by a later written decision (no eyebrows). Confirm.
- ~~**P13 (bug):** clicking a timeline entry doesn't scroll to it. `choose()` uses `offsetTop`, which is measured from the entry's day section (`position: relative`), not the rail. It scrolls to the wrong place (e.g. clicking the Day 2 transit scrolls to the top).~~ Fixed in Part 1.
- **P13:** the map-to-photo marker and photo-location dot work. Numbered pins are the place order across the whole trip.
- **Code:** `dateLabel` and `allPlaceIndex` in `Client.tsx` are unused. Photo URLs in the DB are overwritten at read time.
