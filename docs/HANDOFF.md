# Handoff: verifying the real sources (on the owner's computer)

## Where things stand

- **Phase 0 is done**: the journey page was verified part by part against the mocks, refactored,
  and covered by CI (format, types, build, 34 interaction checks, 36 screenshot states).
- **Mobile is done**: one-column timeline under 1200px, phone layout under 900px (full-screen map,
  details sheet, swipeable photo viewer).
- **Phase 1 (data design) is agreed**: `docs/DATA-DESIGN.md`. In short: the plan comes from the
  Jarvis SQLite database and is the skeleton; the Android Timeline export (sliced to the trip in the
  browser) adds actual times and transit modes to the entries it matches, and everything else from it
  is a suggestion needing approval; photos and videos come from the Google Photos Picker and are
  copied into the app; all of it is editable in edit mode; a trip is a draft until published; editors
  are a Google allowlist and viewers an email allowlist with a one-time sign-in link.
- **Postponed by the user**: the top bar and a day scroller. Live options:
  https://claude.ai/artifact/V9Fa92HhY897rcKrsadNrw
- Hosted preview of the sample trip: https://claude.ai/artifact/SCUXjuqmaHh9TjeaXQ3MJH

## The real sources are verified

All three were checked on the owner's computer; the findings are in `docs/DATA-DESIGN.md`
("Findings from the real sources"). Real files stay outside the repo, in a private folder on the
owner's machine (for example `~/trip-summary-data/`), and are never committed or pasted into pull
requests.

- **Jarvis database**: the agent keeps it in its data directory (`jarvis_data/travel/travel.sqlite`
  on the agent's host). Copy it with a read-only online backup (open with `mode=ro`, SQLite's
  `backup`, stream it over SSH) so the live file is never written or locked.
- **Timeline**: exported on the phone (Settings → Location → Location services → Timeline → Export
  Timeline data) and pulled with `adb pull` over wireless debugging.
- **Photos Picker**: a Google Cloud project named `trip-summary` (ID in the Cloud console), with
  only the Photos Picker API enabled, no billing, the consent screen in testing mode with the owner
  as the only test user, and a web OAuth client whose redirect is
  `http://localhost:3100/api/auth/callback/google`. Its ID and secret are in `.env.local`
  (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, git-ignored).

## Next: Phase 2

The architecture is decided: `docs/ARCHITECTURE.md` (Netlify + Firebase, invite links for viewers).
The steps are listed in `docs/ROADMAP.md` under Phase 2; steps 1–7 are done (the store, importers and merge, the
agreed screens, sign-in and sharing, photos), and step 8 is trying it and tuning on the real trip. Thresholds and the proposed matching rules are tuned against the real trip in a private
draft, never by committing it.

## Phase 3: edit mode

Edit mode is the journey page with `?edit=1` (editors only; **Edit** in the editors' bar, **Done**
to leave). The right column becomes the edit panel (DESIGN.md, "Edit mode"): the inbox of what the
Timeline found (M2), an entry's editor (E1, with photos P1), and an unplanned stop's card (S1, with
"Open in Google Maps" until the Places API). Highlights show as a stamp beside the title (H5). On a
phone the inbox opens from a button as a sheet. Every change is an edit (`lib/edits.ts`), saved as
you go and undoable; `lib/edit-view.ts` merges fresh for the panel. Still to build: "Sort photos" on
a day (P2), for bulk moves.
