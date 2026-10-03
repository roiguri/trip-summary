# Architecture: hosting, data and sign-in

Where the app runs, where its data and media live, and how people sign in. Decided with the owner
before Phase 2 **(agreed)**, so the data layer is written once, for the store it will run on.
Account names, project IDs and keys never go in the repo; they live in the providers' consoles and
in git-ignored env files.

## The decision

- **Netlify** hosts the Next.js app, server-rendered as today.
- **Firebase**, on the pay-as-you-go Blaze plan, is the one service behind it:
  - **Firestore** holds the trips, the imported sources, the edits and the merged journal.
  - **Cloud Storage** holds photos, videos and their resized copies.
  - **Firebase Auth** signs editors and viewers in.
  - **Cloud Functions**, only if hosting shows they're needed: copying long videos from Google
    Photos (see Imports).
- The Google Cloud project created for the Photos Picker becomes the Firebase project, so the
  Picker's OAuth setup carries over.

Two services in total, both already used in the owner's other apps, at no cost at this scale.

### Why not the alternatives

| Option                                 | Why not                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Supabase, Appwrite                     | Free projects pause after a week without use; a journal opened now and then would be paused for guests |
| Cloudflare (Workers, D1, R2)           | One account and free, but the free CPU and size limits mean rewriting the page as a static site + API  |
| Vercel or Netlify + Turso + R2 + email | The most portable, but three or four accounts to run                                                   |
| The owner's own server                 | The owner doesn't want to host it at home                                                              |

## How it works

### A page view

The merge runs once per import, not per view: its result, the journal, is stored in Firestore one
document per day. A page view checks the viewer's access and reads that trip's journal documents.
Photos and videos are served through the app's `/media/…` route, which checks the viewer's access to
that trip on every request and supports range requests (seeking in a video); Storage itself is closed
to direct reads **(agreed, Oct 2)**. Signed URLs can replace it at hosting if bandwidth through the
app's functions costs too much.

### Sign-in and access

- **Editors** sign in with Google. A per-trip allowlist decides who may edit **(agreed)**.
- **Viewers** get a **personal invite link**, created in the app and sent by the owner however they
  like (no email service) **(agreed)**. Opening it signs that browser in as that viewer: the server
  checks the link and issues a Firebase custom token. A link can be revoked, and works for one
  browser; a viewer may also sign in with Google instead.
- Access is checked on the server for every page and media URL, and Firestore and Storage security
  rules deny all direct client access, so a leaked config gives nothing.

### Imports

- **Plan**: the Jarvis SQLite file is chosen in the browser and uploaded; the server reads the trip
  from it and stores the rows in Firestore.
- **Timeline**: sliced in the browser to the trip's dates **(agreed)**; only the slice is uploaded.
- **Photos and videos**: the editor connects Google Photos (a separate, read-only consent for the
  photos they pick; the access token lives about an hour in an encrypted HTTP-only cookie, and no
  refresh token is asked for) and picks in the Google Photos Picker. The app copies the picked items
  as a job: the picked items are listed once and kept, then copied 8 at a time per request, so each
  request fits a short function's time limit. Google's own 2048px and 400px versions are downloaded
  (not originals, about fifty times less data **(decided Oct 3)**) and re-encoded with all metadata,
  location included, removed; videos are kept as they are, with Google's thumbnail as the still.
  The copying runs in the owner's browser in the background **(decided Oct 3)**: it carries on
  across the app's pages and resumes after a reload, with its progress shown on every page; two
  tabs never copy the same job. Like every import, picked photos wait for review before they're
  applied **(agreed, Oct 2)**.
- **Cloud Functions, if needed**: copying lives in one module (`lib/media/`). If long videos turn out
  to exceed the host's time limit, the same module moves into a Cloud Function driven by a job queue,
  and how the function gets the Google token is decided then **(agreed, Oct 2: decided at hosting,
  after measuring)**.

### Firestore layout (proposed, settled in Phase 2's data-model step)

`trips/{tripId}` holds the trip, its status (draft or published) and its access list. Under it:
`plan` (the imported Jarvis rows), `timelineSegments`, `photos`, `edits`, `imports`, and `journal`
(one merged document per day). `invites/{token}` maps an invite link to a trip and a viewer. The
logical model is the one in `docs/DATA-DESIGN.md`; only its storage changes from tables to documents.

## Rules that keep it portable

Firebase is a proprietary stack, so moving away is real work. These rules keep it bounded:

1. **One data module.** Every Firestore, Storage and Auth call goes through `lib/store/` (and the
   functions' own equivalent). Moving providers means rewriting that module, not the app.
2. **An export command** writes the whole store to plain files: JSON for the data, and the media
   files. It is both the backup and the way out.
3. **No Netlify-specific features** in the app; any Node host can run it.
4. **The merge is plain code** with no Firebase in it, tested on its own.

## Development and costs

- **Local development and tests** run against the **Firebase Emulator Suite** (Firestore, Storage,
  Auth, Functions on the developer's machine), so no cloud project is touched and CI needs no keys.
  They use the emulator-only project `demo-trip-summary` and need Java 21+. The Firebase CLI runs at
  a pinned version through `scripts/firebase.mjs` rather than from `package.json`, so its large
  dependency tree stays out of the app's lockfile and audit.
- **Sign-in in development**: the Auth emulator stands in for Google. `/api/auth/dev` signs a
  browser in as the mock owner (`owner@example.com` unless `OWNER_EMAIL` is set) or opens a fresh
  invite as a mock viewer; it exists only when the app runs on the emulators with a `demo-` project.
  The app reads `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST` and
  `FIREBASE_STORAGE_EMULATOR_HOST` at run time, and the
  sign-in page needs `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` at build time.
- **Photos in development**: on the emulators the import page offers "Use the mock photos", which
  copies `data/mock/picker.json`'s items through the same path as a real pick. A real pick needs
  `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (the OAuth client from the Picker check, in
  `.env.local`) and works locally, since its redirect is `localhost:3100`.
- **Settings in production**: `OWNER_EMAIL` (the owner, who edits every trip and creates trips),
  `FIREBASE_PROJECT_ID`, and the web app's `NEXT_PUBLIC_FIREBASE_API_KEY`,
  `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` and `NEXT_PUBLIC_FIREBASE_PROJECT_ID`; for photos
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PHOTOS_TOKEN_KEY` (32 random bytes, base64: it seals
  the Google token's cookie) and, if not the project's default, `FIREBASE_STORAGE_BUCKET`.
- **Secrets** (the Admin SDK service account and the Picker's OAuth client secret) live in
  `.env.local` locally and in Netlify's environment settings, never in git.
- **Blaze** needs a card, but usage stays inside the free allowance at this scale (Cloud Storage
  includes 5 GB stored and 100 GB downloaded a month, for buckets in the regions that qualify, so
  the bucket goes in one of them; Firestore 1 GB). A **budget alert** warns
  before anything is charged. Videos are the main cost driver; whether to keep originals or a
  smaller copy is decided in the import design round.
