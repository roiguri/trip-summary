# WAYFARER trip journal: design decisions

This document records the agreed visual direction for the local trip-summary prototype. It is not a claim that every reference pixel has been matched. Review screenshots against the reference before changing a locked choice.

## Identity and layout

- Keep the WAYFARER wordmark and mark at the left of the header, journey navigation in the header, and compact status at the right. Do not change the header when the right column collapses.
- The page stays inside the viewport. The timeline alone scrolls; the right column and its detail card do not scroll. Show the first day's banner at the rail's start. Center the timeline when the right column is collapsed; use a round reopening control.
- The timeline has a vertical green rail, day banners, alternating entries, small uppercase type/time labels, and tilted overlapping photo stacks. Timeline entry titles are plain text with no underline, including hover. Place, lodging, single-photo, and photo-cluster entries use one dot-and-horizontal-line connector geometry. Transit stops keep their text 26px from the rail (clear of any running multi-day lanes), the disc centred on a fixed teal segment, with line icons per mode and a time-zone label on each end when they differ. Loose photos are titled by their caption, and have no title when there is none; a photo cluster is a small spread deck of up to three cards; photo bylines show only the time. The node and connector (and the transit disc) are centred on the title's first line, not its baseline or the title + byline block (user decision). A place's note appears in full under its photos, clamped to two lines (notes: four) with a "See more" toggle. Note cards have a small translucent tape strip on their top edge, and are anchored in time with a rail node and arm level with their title. Place captions use the same paper, as a small slip with tape under the photos (user decision). Note direction and alignment follow the language of its text: English LTR/left, Hebrew RTL/right.
- Transit is a compact rail stop, not a place entry: a small round mode icon sits over the rail, with three small text lines beside it (title; start time → end time with time zone; origin → destination). No horizontal place connector. The short transit leg is a teal-blue dotted line behind the icon, distinct from the solid green rail elsewhere. Transit title is bold ink; time/time-zone and origin → destination are small teal text.

## Typography

- The reference raster carries no embedded font metadata, so an exact original font file cannot be recovered from pixels. Visual comparison of Latin letterforms and metrics supports an Arial/Helvetica-style neo-grotesque. The build specifies Arial, Helvetica, sans-serif for all Latin text and inherits it into buttons. Entry headings use 20px, weight 750 (browser Arial bold); transit heading is 13px, weight 700; small times/labels are 10px. Hebrew uses the browser font fallback where Arial lacks glyphs. Do not claim a different named proprietary font without source evidence.

## Map and detail

- The map is a floating rounded card, not a flat sidebar. Expanded map/detail cards and collapsed round control are the two states. Map above detail; default map height is about 40% of the fixed right column and detail about 60%. Keep `?map=small|current|large` for comparison.
- Use MapLibre with live OpenFreeMap tiles and a muted paper palette, numbered place markers, straight dotted route links, a Whole trip control, and day emphasis during timeline navigation. Continuing multi-day stays get a small rail-side day chip. Loose photo and cluster timeline entries have one small tilted print, a PHOTO/time label, and the shared connector geometry. Photo-sequence detail cards have no eyebrow (the later explicit panel decision removed it); they show the count title, time range, balanced photo grid, and footer count/pager. The older cluster screenshot predates that decision. Photo selection can add/highlight a photo-location dot. Do not mistake the illustrative early mock map for the approved live map.
- Detail cards have rounded paper surfaces. For a place: title, date/time with tags inline, photos, note, then small Google Maps link. Do not add eyebrow labels above detail titles. The fallback Google Maps URL is a coordinate search link when no stored place URL exists.
- Detail views cover places, single loose photos, photo clusters, lodging with check-in/out, and day albums. The detail card has a label row (THE PLACE, THE STAY, THE ROUTE, …, with the date), the title, a metadata line (time and tag; route and zones for transit), the photos with count and arrows, then the note (the timeline's paper note without the tape, with "See more") and the Maps link. Photo tap opens a fullscreen viewer with keyboard Escape and arrow support.
- Gallery pages show up to 12 photos, laid out by count (one full tile, two split, three as a mosaic, and equivalent balanced layouts for other counts). Photos keep a natural tile size and are not stretched; the detail card shrinks to its content, with the photo count and pager directly under the photos (decision of Sept 26, replacing "fill the space"). If content would outgrow the column, the rows shrink together; the panel never scrolls. Photo sequences of five use the 2x3 grid; places and albums with five use two over three. The chosen pager is style A, thin unframed chevrons. Both chevrons share an identical vector path and align optically with the page count.

## Right column and map (user decisions)

- The map card and the detail card open and close independently. Nothing is selected at first; the map keeps its size alone or above the details. The detail card appears under the map when an entry is selected and has its own close button. A closed map folds into its header strip while details are open, and into a small "Map" pill (map icon) in the same corner when nothing else is open; the timeline then centres. Changes animate as one motion: the map card morphs between open, strip and pill, the detail card slides in and out, the timeline glides.
- Map: close pins merge into a "N stops" pill that zooms in on click; the route is a round-dot line per day (current day strong, others faint); transit legs show their mode icon between their neighbouring stops; OpenStreetMap attribution is always visible.

## Phone layout (user decisions)

- Under 1200px the timeline is one column (the right column stays, narrower, from 900px); under 900px the page is the phone layout.
- On a phone the page is one column. The rail runs down the left edge with every entry on its right; points are plain copper rings with a short connector to the title, clearing any multi-day lanes. The header keeps the brand and a menu.
- The map is a full-screen view opened from a floating "Map" button, with every day as a pill in one sideways-scrolling row and a card for the tapped pin. Details open in a bottom sheet at two thirds of the screen (or less for short entries) that pulls up to full height.

## Data and publication boundary

- Seed only fictional Carmel/Monterey trip data, with `America/Los_Angeles` from the destination. The supplied core SQLite schema includes a unique current-trip index; the sample's extra photos table is prototype-only. No real trip data belongs in the repo.
- The original Vite skeleton is retained under `legacy-vite/`. The prototype's runtime database and build artifacts are ignored. Sample-photo credits and URLs live in `public/photos/SOURCES.txt`; review media licenses before any public deployment.
- Code changes to the GitHub baseline should follow the user's approval of each change round. Do not deploy without a separate decision.

## Multi-day geometry

- A span begins at a full event block's rail node on day 1, follows a fine round-dot lane about 6px to the right of the green rail, uses a small paper tab on each later day, and ends at its final-day time with an unfilled diamond and end-time label. This is a separate event span from the short teal-blue transit segment.
- The sample adds a fictional three-day Coast Path Walk specifically to exercise this treatment; the real trip database is not included.

## Multi-day lanes and ends (user decisions)

- Overlapping multi-day events run in side-by-side lanes, 9px apart (+9, +18, +27px right of the rail centre); each takes the lowest lane that is free when it starts. At most 3 lanes; further concurrent events have no line and grey labels. Lane colours: sage (1), ochre (2), plum (3), used for dots, end curve, diamond, END label and label edge. END labels and later-day labels clear all lanes still running.
- A lane starts and ends the same way (mirror images): it leaves the event circle's centre diagonally, eases out to its lane over ~24px, and at the end eases back in to arrive diagonally at the diamond's centre. Dots are evenly spaced (~12px) along the whole path; those inside the circle or diamond are hidden. The END label sits close to the diamond (10px gap).
- Later-day labels sit ~20px under the day banner.
- Hovering, focusing or selecting a multi-day event highlights its lane, labels and end marker; other lanes fade to 35% when more than one is drawn. Later-day labels are clickable and select the event.

## Hotel stays (user decisions)

- A stay is not a multi-day lane. It shows as a check-in entry ("CHECK-IN · 15:00"), a compact copper "End of day" marker at the bottom of every day whose night is spent there, and a check-out entry ("CHECK-OUT · 11:00") at its time on the last day.
- The check-in entry, the end-of-day markers and the check-out entry all open the same stay panel and share its selected state.
- On a changeover day, stay A's check-out and stay B's check-in are ordinary entries at their times, and the day ends with B's marker.
- Stays with a location get a house marker on the map (not a numbered pin). Overnight transit is not a night.

## Final visual correction, September 26

Correction (user decision, Sept 26, replacing the "two-track throughout" note): the round-dot lane belongs to multi-day events only, as the locked geometry mock shows. The plain rail is a single solid green line (4px #c4d3c7). While a multi-day span runs, a lane of 2px #739d7c round dots every 12px runs 9px right of the rail centre, from the span's start node to its end diamond. At transit the solid line turns teal through the compact icon stop; the round icon has a pale paper fill and thin teal outline. Transit type remains smaller than full place titles, with teal time and route. Later-day chips use pale paper and a muted border. Single and clustered photo cards, as well as place fans, have edge-to-edge images with light rotation, rounded corners and soft shadows, never a white instant-photo border.

## Home, adding a trip and imports (user decisions, Oct 2)

Options and drawings: https://claude.ai/artifact/4QQeC2zq2rSBUAixmcDmDf (Phase 2, step 6).

- Home (H1): a shelf of trip cards, newest first. Each card has one cover image (no extra small
  photos), a Draft or Published label, the title, dates, day count and destination, and a footer
  saying what a draft still needs or who can see a published trip. Editors get a "New trip"
  button; viewers see only the published trips shared with them.
- Adding (A3): importing has a page of its own, never shown beside the journey. "New trip" opens it
  at the plan (choose the Jarvis database file, pick the trip; it becomes a draft). The page lists
  the three sources one under another, each with its status and its own action (update the plan,
  add the Timeline, open Google Photos), in any order and as often as needed. The Timeline file is
  read in the browser and only the trip's days are uploaded.
- Review (R3): after each import its changes appear on the import page, under the sources, grouped
  by day; then Apply or Discard. A published trip changes only on Apply. Each source waits and is
  reviewed on its own, so photos can copy while the Timeline is reviewed. **The review shows only
  what changes in the trip (decided Oct 3):** a plan update's added, removed, renamed or retimed
  entries, and where new photos land. Everything the Timeline found (actual times, travel modes,
  stops not visited, new stops) is offered in edit mode instead, and nothing in the review is a
  suggestion.
  Marking changes on the journey itself (R2) was preferred but deferred: it needs new states in the
  locked timeline and map; it can come with edit mode if suggestions appear on the journey there.
- Trip controls (C1): editors get a bar under the header on the journey: the trip's status,
  "+ Add sources" (opens the import page), a waiting review with its count, Edit, "Preview as a
  viewer", and Share. Share lists the people who can see the trip, each with a personal invite link
  to copy or revoke, and creates a new link by name. Viewers never see the bar.
- As built (step 7e): an invite link is shown once, when created, to copy and send; only its hash is
  stored, so a link can't be shown again. A person who hasn't opened theirs gets "New link" (the
  old one stops working). "Preview as a viewer" shows the journey exactly as viewers see it, with
  an "Exit the viewer's preview" button. On a phone the bar drops the status label (Publish or
  Unpublish says it) and uses short labels ("+ Sources"). The header's right side names the
  signed-in account, with "Sign out", replacing the prototype's "View-only demo" note.
- Empty state (E2): before the first trip, a short "No trips yet" with one "New trip" button,
  under the dashed rail and node drawing (an entry still to come). The import page explains each
  source when you get there. A viewer with nothing shared sees "No trips to show yet" and what to do
  with a link, under the same drawing.
- Trip cover (K2): the owner's pick (from the card's menu, or a highlighted photo in edit mode);
  until then, the first photo of the trip's most photographed stop. A trip with no photos gets a
  paper cover: the destination's name over a faint dotted route.

## Edit mode (user decisions, Oct 3)

Options and drawings: https://claude.ai/artifact/Wvm7oAhSYKQGetpMWAqcXV.

- Where (M2): "Edit" in the editors' bar switches edit mode on. The right column becomes an inbox of
  what the Timeline found, grouped by day, with filters (times, new stops, not visited), a count down
  to zero, and "accept the day's times". Picking an item scrolls the journey to it. On a phone the
  inbox is its own screen. Nothing the Timeline found changes the journal until accepted here.
- Entry (E1): clicking an entry while editing opens its editor in the right column: title, times
  (each optional; clearing them leaves it untimed), note, the visit from the Timeline (use its times,
  unlink a wrong match, link the right visit), for a leg its travel mode (car, bus, train, flight,
  ferry, on foot, bike), highlight, hide, and undo. Photos (P1): tick photos, then "Move to…" (same
  day and nearest in time first, loose moments, or another day), make loose moments, hide (shown
  faded, so they can come back), or set as cover.
- Suggestion (S1): an unplanned stop opens a card with its time and length, a small map with the
  nearest planned stop, "Open in Google Maps", and its photos; then add it as a new stop (named by
  the owner; its times kept, changed or none), "it's a stop already in the plan" (that entry takes
  this visit's times and photos), or dismiss. Place names and search wait for the Places API.
- Highlight (H5): a small stamped "HIGHLIGHT" label after the title: square corners, a copper
  outline, uppercase, slightly tilted, unlike the day's pale green rounded labels.
- Sorting photos (P2): "Sort photos" on a day's banner in edit mode shows the day's photos in time
  order, each labelled with where it is; select several (shift-click for a run), then click the
  entry they belong to.

## Edit mode, round 2 (user decisions, Oct 3)

From the first build; same preview page. These replace M2's inbox and refine H5.

- On the timeline (T1): every finding is drawn where it happened, not in a list. A proposed time or
  mode sits under its entry (Use, Ignore); "No visit found" under a planned stop (Link a visit, Fine
  as it is); an unplanned stop or journey is a dashed entry at its own time on the day's rail (Add…,
  It's a planned stop, Dismiss, Google Maps). A day banner offers "Accept the day's" times. The bar
  counts what's left ("18 to review") with Previous and Next, which scroll to each finding in turn.
  The right column stays the map, with the editor (E1, S1) under it once something is opened. A stop
  added from the Timeline is marked "Added from your Timeline · Undo" while editing.
- Set aside, not gone (R1): ignored times and modes, dismissed stops, "fine as it is" and hidden
  entries are drawn faded when "Show resolved" is on, each with Bring back (or Show again).
- Main photos (MP1): the photos an entry shows on the journey are numbered 1, 2, 3 in its photo grid;
  "Show on the journey" puts the selected ones first. "Back to time order" undoes it.
- Photo highlights (PH1): "★ Highlight" on selected photos; a highlighted photo carries a copper star
  wherever it shows. A Highlights album is for later, apart from edit mode.
- Marks (K1): the pencil is a drawn outline pencil icon (PA, no circle around it), and the HIGHLIGHT stamp,
  both on the title's side away from the rail (before a left-hand title, after a right-hand one; in
  one column, after). The stamp keeps H5's look, set larger (11px, less spaced, lightly filled: SA).

## Cosmetic changes (user decisions, Oct 3)

- Timeline nodes are a plain copper ring, without the inner dot.
- The right column (map, details, editor) sits 16px from the screen's right edge at every width.
- Previous and Next in the edit-mode bar use thin drawn chevrons.
- The map draws travel legs only from about city level in (zoom 10); zoomed out over a whole trip
  they crowded the pins. The selected leg always shows.
- In edit mode the right column doesn't scroll: the map stays fixed as in display mode, and the
  editor below it scrolls inside its own card, never sideways, with a thin rounded scrollbar in the
  card's soft green.
- The timeline's area runs from the left edge to 16px short of the right column, and the timeline is
  centred in it, so its scrollbar sits beside the cards; it is styled like the editor card's.
- An answer in edit mode (Use, Ignore, Fine as it is, Accept the day's) shows "Saving…" until the
  page has the change, then a ✓ chip on the entry saying what was done, with Undo, while editing.

## Exact sampled backgrounds and remaining gaps

The locked reference background is RGB (255,253,250), `#fffdfa`, sampled at (10,110), (800,110) and (10,500) across the whole, place and geometry captures. The large card interior in the locked whole/place captures is `#fffdf8` (255,253,248); the implementation sets those tokens explicitly. Recheck these pixels after a build. Remaining gaps: substitute/reused photos are not the original images and may not match captions; reference PNGs do not disclose an exact font binary (Arial/Helvetica family is inferred); the dotted multi-day end bend is still visually subtle rather than the reference's more pronounced curve.
