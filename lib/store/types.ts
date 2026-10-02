// The stored model (docs/DATA-DESIGN.md, "Three layers"; layout in docs/ARCHITECTURE.md). Times are
// ISO strings and every value is plain JSON, so the export command can write the store out as-is.

export type TripStatus = 'draft' | 'published';

/** `trips/{tripId}`. The trip's ID is Jarvis's `trip_id`, so a re-import finds the same trip. */
export type Trip = {
  tripId: string;
  title: string;
  destinationName: string;
  /** IANA zone of the destination: the default for every local time in the trip. */
  timezone: string;
  startDate: string | null;
  endDate: string | null;
  status: TripStatus;
  createdAt: string;
  updatedAt: string;
  /** What the home page shows on the trip's card, worked out with each journal rebuild. */
  summary?: TripSummary;
};

/** A trip's card on the home page (DESIGN.md, "Home, adding a trip and imports"). */
export type TripSummary = {
  /** The cover's image: the owner's pick, else the first photo of the most photographed stop; null
   *  for a paper cover. */
  cover: string | null;
  coverFrom: 'pick' | 'stop' | null;
  photos: number;
  stops: number;
  hasTimeline: boolean;
  hasPhotos: boolean;
};

/** Jarvis rows as imported, column names kept (lib/schema.ts CORE_SCHEMA). */
export type JarvisRow = Record<string, string | number | null>;

/** `trips/{tripId}/sources/plan`: one trip's rows from the Jarvis database, replaced on re-import. */
export type PlanSource = {
  destination: JarvisRow;
  trip: JarvisRow;
  /** Only the places the itinerary references. */
  places: JarvisRow[];
  itinerary: JarvisRow[];
  importedAt: string;
};

/** `trips/{tripId}/timelineSegments/{key}`: one visit or activity from the Timeline slice. */
export type TimelineSegment = {
  /** `kind:startTime(UTC):placeId-or-mode`, stable across re-imports. */
  key: string;
  kind: 'visit' | 'activity';
  startUtc: string;
  endUtc: string;
  /** Minutes east of UTC, or null where the export gave none. */
  startOffsetMin: number | null;
  endOffsetMin: number | null;
  probability: number | null;
  /** A visit's place, or an activity's start. */
  lat: number | null;
  lng: number | null;
  // Visits only.
  placeId: string | null;
  semanticType: string | null;
  /** 0 for a top-level visit; higher when nested inside another, such as a shop in a mall. */
  hierarchyLevel: number | null;
  // Activities only.
  endLat: number | null;
  endLng: number | null;
  mode: string | null;
  distanceMeters: number | null;
};

/** `trips/{tripId}/photos/{mediaId}`: one picked photo or video. */
export type TripPhoto = {
  /** Google Photos media ID: stable, so a re-pick doesn't duplicate. */
  mediaId: string;
  kind: 'photo' | 'video';
  takenUtc: string;
  /** Local offset in minutes: from EXIF, else the Timeline, else the destination's zone. */
  offsetMin: number | null;
  offsetSource: 'exif' | 'timeline' | 'destination' | null;
  width: number | null;
  height: number | null;
  mimeType: string;
  filename: string;
  /** Storage paths of the stored copies. */
  files: { display?: string; thumb?: string; video?: string; still?: string };
};

export type EditTarget = 'trip' | 'day' | 'entry' | 'place' | 'photo' | 'suggestion';

/** `trips/{tripId}/edits/{target~key~field}`: the owner's decision about one field. */
export type Edit = {
  target: EditTarget;
  /** Jarvis entry or place ID, Google place or media ID, Timeline segment key, or a date. */
  key: string;
  field: string;
  value: string | number | boolean | null;
  at: string;
  by: string;
};

export type ImportSource = 'plan' | 'timeline' | 'photos';

/** `trips/{tripId}/imports/{id}`: one import, kept as a log. */
export type ImportRecord = {
  id: string;
  source: ImportSource;
  at: string;
  by: string;
  /** Counts of what changed, for the import review. */
  summary: Record<string, number>;
  state: 'pending' | 'applied' | 'discarded';
};

/**
 * The merged trip as the page draws it, rebuilt after every import and edit so a page view only
 * reads. Stored as `journal/meta`, one `journal/day-{date}` per day (a document holds at most 1 MiB)
 * and `journal/review` (what edit mode needs: suggestions and orphaned edits).
 */
export type Journal = {
  trip: import('../model.ts').Trip;
  suggestions: import('../merge/index.ts').Suggestion[];
  orphanEdits: Edit[];
  builtAt: string;
};

export type Role = 'editor' | 'viewer';

/**
 * `people/{personId}`: someone who may see a trip (docs/DATA-DESIGN.md, "Access"). An editor is a
 * Google account (by email). A viewer has a personal invite link: only its SHA-256 hash is stored,
 * and the first browser that opens it is bound to it (by the hash of a device cookie).
 */
export type Person = {
  personId: string;
  tripId: string;
  name: string;
  role: Role;
  /** A Google account's email: editors, and viewers who sign in with Google. */
  email: string | null;
  /** The sign-in account once known: a Google user's UID, or `v_{personId}` for an invite link. */
  uid: string | null;
  inviteHash: string | null;
  deviceHash: string | null;
  createdAt: string;
  createdBy: string;
  lastOpenedAt: string | null;
  revokedAt: string | null;
};
