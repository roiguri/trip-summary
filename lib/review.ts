// What an import changes, for the review on the import page (DESIGN.md, "Review (R3)"): the trip
// merged before and after the import, compared entry by entry and grouped by day.
import type { MergeResult, Suggestion } from './merge/index.ts';
import type { Entry, Photo, TransitMode } from './model.ts';

export type ReviewItem =
  | { kind: 'times'; id: string; title: string; from: string; to: string }
  | { kind: 'mode'; id: string; title: string; mode: TransitMode }
  | { kind: 'unvisited'; id: string; title: string; time: string }
  | { kind: 'added'; id: string; title: string; time: string }
  | { kind: 'removed'; id: string; title: string; time: string }
  | { kind: 'retitled'; id: string; from: string; to: string }
  | { kind: 'notes'; id: string; title: string }
  | { kind: 'suggestion'; suggestion: Suggestion; photos: Photo[] };

export type ReviewDay = { date: string; items: ReviewItem[] };
export type Review = { days: ReviewDay[]; counts: Record<ReviewItem['kind'], number> };

/** The plan's own entries (not photo moments or a stay's generated check-out), by ID. */
function entries(r: MergeResult) {
  const out = new Map<string, Entry>();
  for (const d of r.trip.days)
    for (const e of d.entries)
      if (e.type !== 'photo' && e.type !== 'cluster' && e.stay?.role !== 'checkout')
        out.set(e.id, e);
  return out;
}
const span = (e: Entry) => (e.end_time ? `${e.time} – ${e.end_time}` : e.time);
const entryId = (id: string) => id.replace(/^i/, '');

export function review(before: MergeResult, after: MergeResult): Review {
  const a = entries(before);
  const b = entries(after);
  const items: { date: string; time: string; item: ReviewItem }[] = [];
  const push = (date: string, time: string, item: ReviewItem) => items.push({ date, time, item });
  // "Not visited" is news when this import is what brought the Timeline in, or when the entry had a
  // visit before and lost it.
  const timelineArrived =
    !Object.keys(before.matches).length && !!Object.keys(after.matches).length;

  for (const [id, e] of b) {
    const old = a.get(id);
    if (!old) {
      push(e.day, e.time, { kind: 'added', id, title: e.title, time: e.time });
      continue;
    }
    if (old.title !== e.title)
      push(e.day, e.time, { kind: 'retitled', id, from: old.title, to: e.title });
    if (span(old) !== span(e))
      push(e.day, e.time, { kind: 'times', id, title: e.title, from: span(old), to: span(e) });
    if (e.type === 'transit' && e.mode && old.mode !== e.mode && after.matches[entryId(id)])
      push(e.day, e.time, { kind: 'mode', id, title: e.title, mode: e.mode });
    if (old.notes !== e.notes) push(e.day, e.time, { kind: 'notes', id, title: e.title });
  }
  for (const [id, e] of a)
    if (!b.has(id)) push(e.day, e.time, { kind: 'removed', id, title: e.title, time: e.time });
  for (const [id, e] of b) {
    if (e.type !== 'place' || e.span_end || after.matches[entryId(id)]) continue;
    if (timelineArrived || before.matches[entryId(id)])
      push(e.day, e.time, { kind: 'unvisited', id, title: e.title, time: span(e) });
  }

  // New suggestions, with the loose photos taken while they happened.
  const known = new Set(before.suggestions.map((s) => s.key));
  const loose = after.trip.days.flatMap((d) =>
    d.entries.filter((e) => e.type === 'photo' || e.type === 'cluster').flatMap((e) => e.photos),
  );
  for (const s of after.suggestions.filter((s) => !known.has(s.key)))
    push(s.date, s.time, {
      kind: 'suggestion',
      suggestion: s,
      photos: loose.filter((p) => p.date === s.date && p.time >= s.time && p.time <= s.endTime),
    });

  items.sort((x, y) => x.date.localeCompare(y.date) || x.time.localeCompare(y.time));
  const days: ReviewDay[] = [];
  for (const { date, item } of items) {
    if (days[days.length - 1]?.date !== date) days.push({ date, items: [] });
    days[days.length - 1].items.push(item);
  }
  const counts = {
    times: 0,
    mode: 0,
    unvisited: 0,
    added: 0,
    removed: 0,
    retitled: 0,
    notes: 0,
    suggestion: 0,
  };
  for (const { item } of items) counts[item.kind]++;
  return { days, counts };
}
