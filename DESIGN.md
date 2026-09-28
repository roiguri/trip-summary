# WAYFARER trip journal: design decisions

This document records the agreed visual direction for the local trip-summary prototype. It is not a claim that every reference pixel has been matched. Review screenshots against the reference before changing a locked choice.

## Identity and layout

- Keep the WAYFARER wordmark and mark at the left of the header, journey navigation in the header, and compact status at the right. Do not change the header when the right column collapses.
- The page stays inside the viewport. The timeline alone scrolls; the right column and its detail card do not scroll. Show the first day's banner at the rail's start. Center the timeline when the right column is collapsed; use a round reopening control.
- The timeline has a vertical green rail, day banners, alternating entries, small uppercase type/time labels, and tilted overlapping photo stacks. Timeline entry titles are plain text with no underline, including hover. Place, lodging, single-photo, and photo-cluster entries use one dot-and-horizontal-line connector geometry. Transit stops keep their text 40px from the rail, the disc centred on a fixed teal segment, with line icons per mode and a time-zone label on each end when they differ. Loose photos are titled by their caption, and have no title when there is none; a photo cluster is a small spread deck of up to three cards; photo bylines show only the time. The node and connector (and the transit disc) are centred on the title's first line, not its baseline or the title + byline block (user decision). A place's note appears in full under its photos, clamped to two lines (notes: four) with a "See more" toggle. Note cards have a small translucent tape strip on their top edge, and are anchored in time with a rail node and arm level with their title. Place captions use the same paper, as a small slip with tape under the photos (user decision). Note direction and alignment follow the language of its text: English LTR/left, Hebrew RTL/right.
- Transit is a compact rail stop, not a place entry: a small round mode icon sits over the rail, with three small text lines beside it (title; start time → end time with time zone; origin → destination). No horizontal place connector. The short transit leg is a teal-blue dotted line behind the icon, distinct from the solid green rail elsewhere. Transit title is bold ink; time/time-zone and origin → destination are small teal text.

## Typography

- The reference raster carries no embedded font metadata, so an exact original font file cannot be recovered from pixels. Visual comparison of Latin letterforms and metrics supports an Arial/Helvetica-style neo-grotesque. The build specifies Arial, Helvetica, sans-serif for all Latin text and inherits it into buttons. Entry headings use 20px, weight 750 (browser Arial bold); transit heading is 13px, weight 700; small times/labels are 10px. Hebrew uses the browser font fallback where Arial lacks glyphs. Do not claim a different named proprietary font without source evidence.

## Map and detail

- The map is a floating rounded card, not a flat sidebar. Expanded map/detail cards and collapsed round control are the two states. Map above detail; default map height is about 40% of the fixed right column and detail about 60%. Keep `?map=small|current|large` for comparison.
- Use MapLibre with live OpenFreeMap tiles and a muted paper palette, numbered place markers, straight dotted route links, a Whole trip control, and day emphasis during timeline navigation. Continuing multi-day stays get a small rail-side day chip. Loose photo and cluster timeline entries have one small tilted print, a PHOTO/time label, and the shared connector geometry. Photo-sequence detail cards have no eyebrow (the later explicit panel decision removed it); they show the count title, time range, balanced photo grid, and footer count/pager. The older cluster screenshot predates that decision. Photo selection can add/highlight a photo-location dot. Do not mistake the illustrative early mock map for the approved live map.
- Detail cards have rounded paper surfaces. For a place: title, date/time with tags inline, photos, note, then small Google Maps link. Do not add eyebrow labels above detail titles. The fallback Google Maps URL is a coordinate search link when no stored place URL exists.
- Detail views cover places, single loose photos, photo clusters, lodging with check-in/out, and day albums. Photo tap opens a fullscreen viewer with keyboard Escape and arrow support.
- Gallery pages show up to 12 photos, laid out by count (one full tile, two split, three as a mosaic, and equivalent balanced layouts for other counts). Photos keep a natural tile size and are not stretched; the detail card shrinks to its content, with the photo count and pager directly under the photos (decision of Sept 26, replacing "fill the space"). If content would outgrow the column, the rows shrink together; the panel never scrolls. Photo sequences of five use the 2x3 grid; places and albums with five use two over three. The chosen pager is style A, thin unframed chevrons. Both chevrons share an identical vector path and align optically with the page count.

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

## Exact sampled backgrounds and remaining gaps

The locked reference background is RGB (255,253,250), `#fffdfa`, sampled at (10,110), (800,110) and (10,500) across the whole, place and geometry captures. The large card interior in the locked whole/place captures is `#fffdf8` (255,253,248); the implementation sets those tokens explicitly. Recheck these pixels after a build. Remaining gaps: substitute/reused photos are not the original images and may not match captions; reference PNGs do not disclose an exact font binary (Arial/Helvetica family is inferred); the dotted multi-day end bend is still visually subtle rather than the reference's more pronounced curve.
