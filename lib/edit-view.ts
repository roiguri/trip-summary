// What edit mode shows (DESIGN.md, "Edit mode"): the trip merged fresh from its sources and edits,
// and from it the inbox of the Timeline's findings, each day's visits for linking, and what the owner
// has already changed.
import { merge, type SegmentView, type Suggestion } from './merge/index.ts';
import type { Entry, Photo, TransitMode, Trip } from './model.ts';
import type { Store } from './store/index.ts';

export type Finding =
  | {
      kind: 'times';
      entryId: number;
      title: string;
      date: string;
      planned: string;
      start: string;
      end: string;
    }
  | {
      kind: 'mode';
      entryId: number;
      title: string;
      date: string;
      time: string;
      planned: TransitMode | null;
      mode: TransitMode;
      start: string;
      end: string;
    }
  | { kind: 'unvisited'; entryId: number; title: string; date: string; time: string }
  | { kind: 'stop'; date: string; time: string; suggestion: Suggestion; photos: Photo[] };

export type EditData = {
  tripId: string;
  findings: Finding[];
  segments: SegmentView[];
  /** Entry ID → the fields the owner has changed, for "Undo my edits". */
  edited: Record<string, string[]>;
  hidden: { id: string; url: string; entryId: number | null; date: string; time: string }[];
  /** The media ID of the owner's chosen cover, if any. */
  cover: string | null;
  /** Entry ID → the suggestion an added stop came from (its edits are kept under that key). */
  added: Record<string, string>;
  /** Entries the owner hid, so they can be shown again. */
  hiddenEntries: { entryId: number; title: string; date: string; time: string }[];
};

const span = (e: { time: string; end_time: string | null }) =>
  e.end_time ? `${e.time} – ${e.end_time}` : e.time || 'no time';

/** The trip as the editor sees it, and what edit mode needs; null without a plan. */
export async function editView(
  store: Store,
  tripId: string,
): Promise<{ trip: Trip; edit: EditData } | null> {
  const [plan, segments, photos, edits] = await Promise.all([
    store.getPlan(tripId),
    store.listTimeline(tripId),
    store.listPhotos(tripId),
    store.listEdits(tripId),
  ]);
  if (!plan) return null;
  const r = merge({ plan, segments, photos, edits });
  const entries = new Map<number, Entry>();
  for (const d of r.trip.days)
    for (const e of d.entries)
      if (e.stay?.role !== 'checkout' && e.id.startsWith('i'))
        entries.set(Number(e.id.slice(1)), e);
  const loose = r.trip.days.flatMap((d) =>
    d.entries.filter((e) => e.type === 'photo' || e.type === 'cluster').flatMap((e) => e.photos),
  );

  const findings: Finding[] = [];
  for (const p of r.proposals) {
    const e = entries.get(p.entryId);
    if (!e) continue;
    if (p.mode && p.mode !== e.mode)
      findings.push({
        kind: 'mode',
        entryId: p.entryId,
        title: e.title,
        date: e.day,
        time: e.time,
        planned: e.mode,
        mode: p.mode,
        start: p.start,
        end: p.end,
      });
    else
      findings.push({
        kind: 'times',
        entryId: p.entryId,
        title: e.title,
        date: e.day,
        planned: span(e),
        start: p.start,
        end: p.end,
      });
  }
  for (const id of r.unvisited) {
    const e = entries.get(id);
    if (e)
      findings.push({ kind: 'unvisited', entryId: id, title: e.title, date: e.day, time: span(e) });
  }
  for (const s of r.suggestions)
    findings.push({
      kind: 'stop',
      date: s.date,
      time: s.time,
      suggestion: s,
      photos: loose.filter((p) => p.date === s.date && p.time >= s.time && p.time <= s.endTime),
    });
  const timeOf = (f: Finding) =>
    f.kind === 'stop' ? f.time : f.kind === 'times' ? f.start : f.kind === 'mode' ? f.time : f.time;
  findings.sort((a, b) => a.date.localeCompare(b.date) || timeOf(a).localeCompare(timeOf(b)));

  const edited: Record<string, string[]> = {};
  for (const e of edits) if (e.target === 'entry') (edited[e.key] ??= []).push(e.field);
  const cover = edits.find(
    (e) => e.target === 'trip' && e.key === tripId && e.field === 'cover',
  )?.value;
  return {
    trip: r.trip,
    edit: {
      tripId,
      findings,
      segments: r.segments,
      edited,
      hidden: r.hidden,
      cover: typeof cover === 'string' ? cover : null,
      added: Object.fromEntries(r.added.map((a) => [String(a.entryId), a.key])),
      hiddenEntries: plan.itinerary.flatMap((row) => {
        const hide = edits.some(
          (e) =>
            e.target === 'entry' &&
            e.key === String(row.entry_id) &&
            e.field === 'hidden' &&
            e.value === true,
        );
        if (!hide) return [];
        const place = plan.places.find((p) => p.place_id === row.place_id);
        return [
          {
            entryId: Number(row.entry_id),
            title: String(row.title ?? place?.title ?? 'An entry'),
            date: String(row.start_date),
            time: String(row.start_time ?? ''),
          },
        ];
      }),
    },
  };
}
