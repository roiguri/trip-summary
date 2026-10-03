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

const FIELDS: Record<EditTarget, Record<string, Rule>> = {
  entry: {
    title: text(200),
    notes: text(5000),
    start_time: time,
    end_time: time,
    hidden: bool,
    highlighted: bool,
    mode: oneOf('car', 'train', 'flight', 'bus', 'ferry', 'walk', 'bike'),
    /** A Timeline segment's key, or "none" for "this entry has no visit". */
    visit: key,
    proposal: oneOf('ignored'),
    noVisit: bool,
  },
  photo: { entry: (v) => v === null || key(v), hidden: bool, caption: text(500) },
  day: { title: text(120) },
  trip: { title: text(200), subtitle: text(300), cover: key },
  suggestion: {
    approved: bool,
    dismissed: bool,
    title: text(200),
    times: (v) => v === 'none' || (typeof v === 'string' && /^\d\d:\d\d-\d\d:\d\d$/.test(v)),
  },
  place: {},
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
