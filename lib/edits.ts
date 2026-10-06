// What the owner can change in edit mode (docs/DATA-DESIGN.md, "3. Edits"; DESIGN.md, "Edit mode"):
// every field an edit may set, with the kind of value it takes. Anything else is refused.
import type { Edit, EditTarget } from './store/types.ts';

type Rule = (v: unknown) => boolean;
const text =
  (max: number): Rule =>
  (v) =>
    typeof v === 'string' && v.length <= max;
const bool: Rule = (v) => typeof v === 'boolean';
const time: Rule = (v) =>
  v === '' || (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v));
const oneOf =
  (...values: string[]): Rule =>
  (v) =>
    typeof v === 'string' && values.includes(v);
const key: Rule = (v) => typeof v === 'string' && v.length > 0 && v.length <= 300;
/** Up to `n` media IDs, comma-separated, in order. */
const mediaIds =
  (n: number): Rule =>
  (v) =>
    typeof v === 'string' &&
    v.split(',').length <= n &&
    v.split(',').every((id) => /^[\w.-]{1,200}$/.test(id));
const blockId: Rule = (v) => typeof v === 'string' && /^b[a-z0-9]{4,24}$/.test(v);
const lat: Rule = (v) => typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90;
const lng: Rule = (v) => typeof v === 'number' && Number.isFinite(v) && v >= -180 && v <= 180;
/** A Google place ID, or empty for a pin placed by hand (no Google place). */
const placeId: Rule = (v) => v === '' || key(v);
const isoTime: Rule = (v) => typeof v === 'string' && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(v);

const FIELDS: Record<EditTarget, Record<string, Rule>> = {
  entry: {
    title: text(200),
    notes: text(5000),
    start_time: time,
    /** The day an entry starts, when the owner moves it (a stay checked into after midnight). */
    start_date: (v) => typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v),
    end_time: time,
    hidden: bool,
    highlighted: bool,
    mode: oneOf('car', 'train', 'flight', 'bus', 'ferry', 'walk', 'bike'),
    /** A Timeline segment's key, or "none" for "this entry has no visit". */
    visit: key,
    proposal: oneOf('ignored'),
    noVisit: bool,
    /** The place chosen in the place window (DESIGN.md, "Place window"): Google's place and its
     *  position, or a pin placed by hand. */
    placeId,
    lat,
    lng,
    /** When the owner last kept this entry's new photos (edit mode stops marking them new). */
    photosSeen: isoTime,
    /** The block it's attached to (a block's key). */
    block: blockId,
    /** The photos shown on the journey, in order: up to three media IDs, comma-separated. */
    photos: mediaIds(3),
  },
  photo: {
    entry: (v) => v === null || key(v),
    hidden: bool,
    caption: text(500),
    highlighted: bool,
    /** Kept: no longer marked new in edit mode. */
    seen: bool,
    /** A loose photo's block (its moment is attached by its photos). */
    block: blockId,
  },
  day: { title: text(120), photosSeen: isoTime },
  trip: { title: text(200), subtitle: text(300), cover: key },
  suggestion: {
    approved: bool,
    dismissed: bool,
    title: text(200),
    times: (v) => v === 'none' || (typeof v === 'string' && /^\d\d:\d\d-\d\d:\d\d$/.test(v)),
    block: blockId,
    placeId,
    lat,
    lng,
    /** An added stop's photos shown on the journey, as a planned entry's. */
    photos: mediaIds(3),
  },
  place: {},
  /** A block (DESIGN.md, "Blocks"): its key is its ID; it exists while any of these is set. */
  block: {
    title: text(120),
    emoji: (v) => typeof v === 'string' && [...v].length <= 4,
    color: oneOf('teal', 'copper', 'olive', 'plum', 'blue', 'ochre'),
    note: text(2000),
    /** Folded by default, for everyone (viewers can unfold it). */
    collapsed: bool,
    /** The photos on its contact sheet, in order. */
    photos: mediaIds(6),
  },
};

export type EditRequest = {
  target: EditTarget;
  key: string;
  field: string;
  value: Edit['value'] | undefined;
};

/** Null when the edit is acceptable; otherwise what's wrong. A value of `undefined` removes the edit. */
export function checkEdit(e: Partial<EditRequest>): string | null {
  if (!e.target || !(e.target in FIELDS)) return 'Unknown kind of thing to edit';
  if (!key(e.key)) return 'Missing what to edit';
  const rule = FIELDS[e.target][e.field ?? ''];
  if (!rule) return `${e.target} has no "${e.field}" to edit`;
  if (e.value === undefined) return null;
  // A photo's entry is the only field where null is a value (back to a loose moment).
  if (e.value === null && !(e.target === 'photo' && e.field === 'entry'))
    return 'Use no value to undo an edit';
  return rule(e.value) ? null : `That isn't a valid ${e.field}`;
}
