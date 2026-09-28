# Fidelity verification against the mocks

Phase 0 goal: confirm that the prototype is implemented correctly against the reference mocks, one part at a time, and agree on each part before moving on. Nothing is refactored until its part is agreed, so the refactor has a known-good target.

## How we verify

- **Current state:** `npm run build && npm run start`, then `npm run capture <dir>` saves every state at 1440×900 (`scripts/capture.mjs`).
- **Targets:** `docs/reference/mock/` (original mocks) and `docs/reference/captures/` (the handoff's "locked" captures of this code). The handoff captures show what the code does. The mocks show what was designed. Where they differ, the part review decides.
- **Precedence:** where a mock conflicts with a later written decision in `DESIGN.md` (the Sept 26 "two-track rail throughout" note was later overruled by the user: the lane is for multi-day events only), the written decision wins unless we agree otherwise.
- **Two kinds of check per part:**
  1. _Visual_: does it look like the reference?
  2. _Behavioural/data_: is it driven by the data, or faked for the sample? A part that looks right but is hard-coded is not done.
- **Map tiles:** OpenFreeMap is blocked in the cloud dev environment, so map captures there show markers on an empty background. Tile styling is verified locally.
- **Data decoupling (applies to every part):** the UI must contain no trip-specific values. Everything it shows comes from the trip model, and the sample is just one data set. A part isn't agreed while it still depends on sample IDs, names, dates or counts in code.
- Per part status: `pending` → `in review` → `agreed` (or `agreed with changes`, listing the changes).

## Parts

| #   | Part                                                                                   | References                                                                                       | Status              |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------- |
| 1   | Page shell: header, intro, scroll model, backgrounds                                   | `mock/app-locked-geometry-final-full`, `mock/image-e55ca7ac`, `captures/wayfarer-locked-opening` | agreed with changes |
| 2   | Rail and day banners (rail, multi-day lane, day tag)                                   | geometry mock, `captures/wayfarer-locked-rail-*`                                                 | pending             |
| 3   | Place / lodging entries (connector, title, byline, photo fan)                          | geometry mock, `mock/roi-shot-cards`                                                             | in review           |
| 4   | Loose photo and cluster entries                                                        | `mock/roi-shot-cards`, `captures/wayfarer-photo-cards-compare-*`                                 | pending             |
| 5   | Transit stop                                                                           | `mock/transit-locked-zoom`, `captures/wayfarer-transit-rail-compare-*`                           | pending             |
| 6   | Notes (tape, LTR/RTL)                                                                  | geometry mock, `captures/wayfarer-locked-notes`                                                  | options in review   |
| 7   | Multi-day span (start block, day chips, dot lane, end diamond)                         | geometry mock, `captures/wayfarer-locked-multiday-end`                                           | pending             |
| 8   | Map card (layout, ratios, markers, route, Whole trip, day emphasis)                    | `mock/trip-real-map-whole-final`, `mock/trip-real-map-day-final`, `mock/panel-ratio-large`       | pending             |
| 9   | Detail panel: place and lodging                                                        | `mock/panel-final-place`, `captures/wayfarer-locked-place`                                       | pending             |
| 10  | Detail panel: photo, cluster, day album, gallery and pager                             | `mock/image-e55ca7ac`, `captures/wayfarer-locked-single`, `-cluster`, `-pager`                   | pending             |
| 11  | Lightbox                                                                               | `captures/wayfarer-locked-fullscreen`                                                            | pending             |
| 12  | Collapsed right column                                                                 | no reference image; written spec in `DESIGN.md` only                                             | pending             |
| 13  | Interactions: click-to-scroll, day tracking while scrolling, map pin → entry, keyboard | written spec in `DESIGN.md`                                                                      | pending             |

## Part decisions

### Part 1: Page shell (agreed with changes)

- The intro scrolls away with the timeline, as in the mock. `.left` is now the single scroll container, and the rail uses the full height under the header once scrolled.
- The title comes from `trips.title` and the subtitle from `trips.notes`, followed by the destination timezone.
- Clicking an entry now scrolls to it; this fixes the P13 scroll bug as a side effect.
- Not changed: the "03 / THE JOURNEY" kicker is navigation chrome, not trip data. The map-card title ("Coastal detour") is handled in Part 8.

### Data separation (done, cross-cutting)

- The sample trip now lives in `data/sample-trip.json` and is loaded with `npm run seed` (format: `data/README.md`). `lib/schema.ts` holds the schema, `lib/db.ts` the loader, and `lib/data.ts` generic queries only. The page reads the database per request.
- Removed from the code: sample dates and day titles, the `Coast` day tag, the `entry_id === 12` span, its chip text and "15:40 · END", the lodging check-out string, map bounds and centre, "3 DAYS", the `PT` special case (zone labels now come from `Intl`), and photo URLs being rewritten at read time. Multi-day spans are generic: any place/note whose end date is later than its start date.
- The walk has its own photo records (same images), so Day 1's album counts 30 real photos.
- Visible changes: the map-card title is now the destination name ("Monterey Coast", not "Coastal detour"); the map fits the actual places instead of a fixed box; the span tag reads "walk" (its place category), not "Walk". Pixel diff of all 20 states: the timeline column is identical.
- Checked with `data/fixtures/test-trip.json` (Kansai, Asia/Tokyo, 2 days, span ending mid-morning, train): renders correctly, with no sample text anywhere in the page.

### Mock style pass (done, before Part 2)

Measured against `mock/panel-ratio-large`, `mock/panel-final-place` and `mock/image-e55ca7ac` at 1440×900 (values fitted from zoomed crops and text widths). It lives in one marked block at the end of `app/globals.css` until the refactor.

- Header 65px; smaller mark; 15px wordmark at 0.07em; 11px nav centred at 680px; 11px status.
- Timeline column 928px, so the rail sits at 515px. Intro title 42px/-0.05em; first day banner at y=305 (22px text) with a darker tag chip.
- Entries: 22px/-0.02em titles; neutral grey bylines; text 68px from the rail centre on both sides; node level with the title baseline (changed in Part 3); 2px arm and ring with a 4px centre dot; photo fans 266×102.
- Right column: 424px cards, 42px from the right, 78px from the top, 13px from the bottom. Map card head 55px with a 16px title. Detail panel with a 26px title, 11px meta, 13px note, 12px Maps link, and a sentence-case photo count ("1 photo" / "16 photos").
- Photo cards (follow-up after review): fan cards 92×98 laid side by side with ~6px overlap and tilts of −4°/+2°/−3° (were 108×92, overlapping ~35px, −4°/0°/+4°); loose-photo cards 100px squares at −4° with 8px corners; panel gallery 7px gaps and 6px corners.
- Detail card fits its content (user decision): no stretched photos, pager right under the gallery, rows shrink only if the card would outgrow the column (checked at 900px and 800px window heights, no overflow in any state).
- Kept on purpose: the thin chevron pager (user preferred it to the mock's round arrows), no title underlines. (The rail was later set to the mock's 4px in Part 2, and the dotted lane limited to multi-day events.)
- Fixed along the way: left-side nodes were 3px right of the rail centre (right side was centred), and entries without photos (lodging) were vertically centred below their connector because entries are buttons.

### Part 2: Rail and day banners (agreed with changes)

Sampled pixel colours and positions from `mock/app-locked-geometry-final-full` (the locked geometry) and `mock/transit-locked-zoom`, then matched them exactly at 1440×900:

- Rail: 4px `#c4d3c7` at x=513–516 (was 3px `#bfd1c1` at 515–517). Now pixel-identical to the mock.
- Round-dot lane: 2px `#739d7c` dots every 12px, centred 9px right of the rail centre (x=523–524), as in the locked mock ("seven pixels to the right" in `DESIGN.md`). Was `#749d85` every 10px at +10px. The grey dots in `image-e55ca7ac` are JPEG blur, not a different colour.
- Dotted lane limited to multi-day events (user decision, matching the locked geometry mock). The handoff's "two-track throughout" note had put it along the whole rail. It now runs only from a span's start node to its end diamond, at the same position and colour.
- Everything tied to the rail moved with it and is centred on x=515: place/photo nodes, the transit disc and teal leg, the multi-day bend and end diamond. Titles still end at 447 / start at 583.
- Day banners: exact fills and shadows (green `#dcead6`/`#c3d6bb`, peach `#f6d1b7`/`#e7b99c`), text `#26342c`, tag border `#d6e1ca`. Size and position already matched (57px tall including the shadow; left edge 178px left of the rail).
- Rail starts at the Day 1 banner and runs behind later banners, as in the mocks.
- First entry after a banner moved down 24px: the node now sits 77px below the banner's bottom edge (mock: 78–79px on all three days). Later-day chips sit within ~6px of the mock.
- Seen in the mocks but belongs to Part 3: places show their note as a short caption under the photo fan ("Start early, no shade after ten."); the build doesn't.
- Removed per-day minimum heights (600/540/470px for days 1/2/3), which were tuned to the sample and had no effect (every day's content is taller).

### Part 7: Multi-day span (in review)

Sampled from `mock/app-locked-geometry-final-full` (positions relative to the rail centre and the end diamond's centre):

- Later-day label ("… · day 2" / "· final day"): 2px `#9cb7a0` left edge, no outline, `#f0f2e8` fill, 2px `#dfe8dc` offset shadow, 11px bold `#76937e`, 22px tall, starting 21px right of the rail centre. Was a 1px outline all round, 10px text, 21px tall.
- Later-day labels sit ~20px under the day banner (user decision; the mock has ~57px).
- Lane: dots are anchored to the end so the curve always lands on the 12px rhythm, whatever the span's length.
- Lane shape (user decisions, replacing the mock's stepped bend): each lane is one dotted SVG path (`LanePath` in `Client.tsx`). It leaves the start node's centre diagonally, eases out to its lane over ~24px, runs down, and eases back in to arrive diagonally at the end diamond's centre; start and end are mirror images. Dots are spaced evenly along the whole path (a whole number of gaps, 11.9–12.0px), and dots inside the node or diamond are hidden behind them. Lanes re-measure when the timeline's size changes, not only on window resize.
- Several multi-day events (user decisions): overlapping spans run in side-by-side lanes 9px apart (+9, +18, +27); each takes the lowest lane free at its start time (`lib/data.ts`). At most 3 lanes: a 4th concurrent span gets no line (start entry, grey day labels and end diamond only). Each lane has its own muted colour (sage `#739d7c`, ochre `#b39247`, plum `#9a7292`) carried by its dots, end curve, diamond, END label and label edge. END labels sit clear of every lane still running at that moment, and later-day labels clear every lane running that day. No "+N" indicator: overflow spans stay visible through their labels. The Kansai fixture has four overlapping spans to exercise this.
- Focus (user decision): hovering or keyboard-focusing an event's start entry, lane, later-day label or end marker highlights that event (stronger, slightly larger dots in its lane colour, filled diamond, tinted labels); other lanes, labels and end markers fade to 35% when more than one lane is drawn. Selecting the event keeps the highlight. Later-day labels are buttons that select the event. Hover areas: a 13px band around each 2px lane; the diamond and label for end markers.
- End diamond: 11px square rotated, 2px `#638e70` border, centred on the rail. Was a lighter 1px border and slightly larger.
- "15:40 · END": 11px bold `#6b8f78`, vertically centred on the diamond. Placed 18px right of the rail centre (a 10px gap from the diamond), closer than the mock's 32px (user decision). Was 10px, 20px right, slightly high.
- Checked with the Kansai fixture (span ending mid-morning with entries after it): the lane stops at the diamond and later entries sit on the plain rail.
- Start block: matches; the caption under its photos belongs to Part 3.

### Part 3: Place / lodging entries (in review)

- Connector alignment (user decision, differs from the mocks): the node and arm point at the middle of the title's first line (cap-height centre), not its baseline. Both mocks put the arm at the baseline, which reads as aligned with the whole title + byline block. Measured: node and arm moved up 11px and now sit exactly on the cap-height centre for places, lodging, photos and clusters, on both sides; a wrapped title keeps the line on its first line. Multi-day lanes still start from the node's centre.
- Caption under the photos (user decision (a), as in the locked mock): places and stay check-ins show their full note under the photo fan (or under the byline when there are no photos), 11px regular `#667766`, on the title's edge and at most as wide as the fan (266px). Notes longer than two lines are clamped with "See more" / "See less"; the toggle doesn't select the entry. The Kansai fixture has a long note to exercise it.
- The transit disc (Part 5) follows the same rule: it was centred on the title + times + route block and now sits on the title's first line; its teal travel segment moves up 12.5px with it so the disc stays centred on it.

### Part 6: Notes (options in review)

User direction: notes and place captions should look alike (the same kind of thing, one attached to an event); notes are anchored in time; better LTR/RTL alignment; see style options before choosing, one of them the paper card with tape.

- Shared in all options: note entries get a rail node and arm level with the note's title (within ~1px), then title, "NOTE · time" byline and the note text. Note text and captions use one component (`EntryCaption`), clamped with "See more" (captions 2 lines, notes 4). Text blocks are only as wide as their text and hug the rail side; each line follows its own reading direction.
- Options, switchable with the temporary A/B/C control (bottom left) or `?notes=b`: **A** paper card with tape for notes, a small paper slip for captions; **B** margin rule, a tinted block with a copper rule on the text's starting side (echoes the detail panel's note); **C** annotation, no box, serif italic (Hebrew kept upright). In B and C, note titles and bylines hug the rail like other events.
- Sample trip now carries the cases: a Hebrew place caption (Garrapata), a long English note, a longer Hebrew note.

### Hotel stays (new, from the Part 7 discussion)

The mocks only show a single lodging entry with check-in/out in the panel. Agreed treatment (option A plus the suggested answers; see `DESIGN.md`, "Hotel stays"):

- Lodging with a later `end_date` becomes a stay: check-in entry, an "End of day" marker for each night (placed after the day's last entry, clearing any running multi-day lanes), and a generated check-out entry on the last day at `end_time`. Bylines read `CHECK-IN · time` / `CHECK-OUT · time` (was `STAY · time`).
- All three open the check-in's stay panel and show as selected together.
- Stays with a place that has coordinates get a house map marker; numbered pins stay for places only.
- Fixtures: the sample inn and the Kansai ryokan now link to located places; Kansai adds a second stay starting on the ryokan's check-out day to exercise the changeover.

## Preliminary findings (to be confirmed per part)

Things noticed during the first capture pass. Each gets decided in its part's review.

- ~~**P1 (scroll model):** in the mocks the trip title block scrolls away with the timeline, and the rail uses the full height under the header. In the code the intro is pinned and the rail scrolls in a window that starts at y≈282. The handoff captures show the code's behaviour, so the handoff did not flag it.~~ Fixed in Part 1.
- ~~**P1:** the intro title, kicker ("03 / THE JOURNEY") and subtitle are hard-coded strings, not the trip's title.~~ Fixed in Part 1.
- ~~**P2:** every day banner shows a hard-coded `Coast` tag. Day titles and dates are hard-coded in `lib/data.ts` (`dates`, `titles`), not derived from the trip.~~ Fixed by the data separation.
- **P2 vs mock:** the mock shows the dotted lane only during a multi-day span. The code shows it along the whole rail, per the later "two-track throughout" decision. Needs confirming.
- ~~**P3:** lodging check-out is the hard-coded string `2026-05-17 · 11:00`. Place tags fall back to `Walk` for missing categories.~~ Fixed by the data separation.
- ~~**P7:** the multi-day span is keyed to `entry_id === 12`. The chip text ("Coast Path Walk · day N") and the end label ("15:40 · END") are literal strings in `Client.tsx`. The span's photos are borrowed from Carmel Beach (entry 1), so the day album counts them twice (Day 1 shows 30 photos; there are 27).~~ Fixed by the data separation.
- ~~**P8:** map bounds, the initial centre, "3 DAYS" and the timezone label `PT` are hard-coded for the sample.~~ Fixed by the data separation.
- ~~**P10:** the pager footer says "1 PHOTOS" for a single photo (no singular form).~~ Fixed in the style pass.
- **P10:** the photo-sequence panel in `mock/image-e55ca7ac` has an eyebrow and a date; these were removed by a later written decision (no eyebrows). Confirm.
- ~~**P13 (bug):** clicking a timeline entry doesn't scroll to it. `choose()` uses `offsetTop`, which is measured from the entry's day section (`position: relative`), not the rail. It scrolls to the wrong place (e.g. clicking the Day 2 transit scrolls to the top).~~ Fixed in Part 1.
- **P13:** the map-to-photo marker and photo-location dot work. Numbered pins are the place order across the whole trip.
- ~~**Code:** `dateLabel` and `allPlaceIndex` in `Client.tsx` are unused. Photo URLs in the DB are overwritten at read time.~~ Fixed by the data separation.
