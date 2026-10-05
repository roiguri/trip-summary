// What edit mode shows (DESIGN.md, "Edit mode"): the trip merged fresh from its sources and edits,
// and from it the inbox of the Timeline's findings, each day's visits for linking, and what the owner
// has already changed.
import { merge, type SegmentView, type Suggestion } from './merge/index.ts';
import type { Entry, Photo, TransitMode, Trip } from './model.ts';
import type { Store } from './store/index.ts';
import { configuredLookup, placeNames, type NameLookup } from './google/places.ts';

/** A finding the owner set aside (DESIGN.md, "Edit mode, round 2", R1): shown only with "Show
 *  resolved", and each can be brought back. */
export type SetAside = 'ignored' | 'dismissed' | 'fine' | 'hidden';

export type Finding = (
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
  | {
      kind: 'stop';
      date: string;
      time: string;
      suggestion: Suggestion;
      /** The first few photos taken there (all a card shows), and how many there are. */
      photos: Photo[];
      photoCount: number;
      /** Google's name for the place (Places API, by its place ID), when known. */
      placeName: string | null;
    }
  | { kind: 'hidden'; entryId: number; title: string; date: string; time: string }
  /** Photos added since the owner last kept this entry's (or, for loose moments, this day's)
   *  photos (DESIGN.md, "Photos without review"). `entryId` null: the day's loose moments. */
  | {
      kind: 'photos';
      entryId: number | null;
      date: string;
      time: string;
      count: number;
      /** When the owner last kept them, for Undo. */
      seen: string | null;
    }
) & { setAside?: SetAside };

export type EditData = {
  tripId: string;
  /** Open findings, in date and time order: "n to review". */
  findings: Finding[];
  /** What the owner set aside, in the same order. */
  setAside: Finding[];
  segments: SegmentView[];
  /** Entry ID → the fields the owner has changed, for "Undo my edits". */
  edited: Record<string, string[]>;
  hidden: { id: string; url: string; entryId: number | null; date: string; time: string }[];
  /** Photos added since last kept: shown with a NEW tag in the editor. */
  newPhotoIds: string[];
  /** The media ID of the owner's chosen cover, if any. */
  cover: string | null;
  /** Entry ID → the suggestion an added stop came from (its edits are kept under that key). */
  added: Record<string, string>;
};

/** A stop's photos as sent to the page: a card shows at most six (one stop can have a hundred). */
const firstPhotos = (all: Photo[]) => ({ photos: all.slice(0, 6), photoCount: all.length });

const span = (e: { time: string; end_time: string | null }) =>
  e.end_time ? `${e.time} – ${e.end_time}` : e.time || 'no time';

/** The trip as the editor sees it, and what edit mode needs; null without a plan. */
export async function editView(
  store: Store,
  tripId: string,
  lookup: NameLookup | null = configuredLookup(),
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

  const fromProposals = (list: typeof r.proposals, setAside?: SetAside): Finding[] =>
    list.flatMap((p): Finding[] => {
      const e = entries.get(p.entryId);
      if (!e) return [];
      const base = { entryId: p.entryId, title: e.title, date: e.day, start: p.start, end: p.end };
      return [
        p.mode && p.mode !== e.mode
          ? { kind: 'mode', ...base, time: e.time, planned: e.mode, mode: p.mode, setAside }
          : { kind: 'times', ...base, planned: span(e), setAside },
      ];
    });
  const fromUnvisited = (ids: number[], setAside?: SetAside): Finding[] =>
    ids.flatMap((id): Finding[] => {
      const e = entries.get(id);
      return e
        ? [{ kind: 'unvisited', entryId: id, title: e.title, date: e.day, time: span(e), setAside }]
        : [];
    });
  // Names for unplanned stops, by Google place ID: cached, a few looked up per view.
  const names = await placeNames(
    store,
    [...r.suggestions, ...r.setAside.dismissed].flatMap((s) =>
      s.kind === 'visit' && s.placeId ? [s.placeId] : [],
    ),
    lookup,
  );
  const fromSuggestions = (list: Suggestion[], setAside?: SetAside): Finding[] =>
    list.map((s) => ({
      placeName: s.placeId ? (names.get(s.placeId) ?? null) : null,
      kind: 'stop',
      date: s.date,
      time: s.time,
      suggestion: s,
      ...firstPhotos(
        loose.filter((p) => p.date === s.date && p.time >= s.time && p.time <= s.endTime),
      ),
      setAside,
    }));
  const hiddenEntries: Finding[] = plan.itinerary.flatMap((row): Finding[] => {
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
        kind: 'hidden',
        entryId: Number(row.entry_id),
        title: String(row.title ?? place?.title ?? 'An entry'),
        date: String(row.start_date),
        time: String(row.start_time ?? ''),
        setAside: 'hidden',
      },
    ];
  });
  const timeOf = (f: Finding) =>
    f.kind === 'times' ? f.start : f.kind === 'stop' ? f.time : f.time;
  const ordered = (list: Finding[]) =>
    list.sort((a, b) => a.date.localeCompare(b.date) || timeOf(a).localeCompare(timeOf(b)));
  // New photos: added after the entry's (or the day's, for loose moments) last "Keep".
  const addedAt = new Map(photos.map((p) => [p.mediaId, p.addedAt ?? '']));
  const seenOf = (target: 'entry' | 'day', key: string) => {
    const v = edits.find(
      (e) => e.target === target && e.key === key && e.field === 'photosSeen',
    )?.value;
    return typeof v === 'string' ? v : null;
  };
  const newPhotoIds: string[] = [];
  const photoFindings: Finding[] = [];
  for (const d of r.trip.days) {
    const looseNew: string[] = [];
    let looseTime = '';
    for (const e of d.entries) {
      if (e.stay?.role === 'checkout') continue;
      const looseEntry = e.type === 'photo' || e.type === 'cluster';
      if (!looseEntry && !/^i\d+$/.test(e.id)) continue;
      const seen = looseEntry ? seenOf('day', d.date) : seenOf('entry', e.id.slice(1));
      const fresh = e.photos.filter((p) => {
        const at = addedAt.get(p.id);
        return !!at && (!seen || at > seen);
      });
      if (!fresh.length) continue;
      newPhotoIds.push(...fresh.map((p) => p.id));
      if (looseEntry) {
        looseNew.push(...fresh.map((p) => p.id));
        looseTime ||= e.time;
      } else
        photoFindings.push({
          kind: 'photos',
          entryId: Number(e.id.slice(1)),
          date: d.date,
          time: e.time,
          count: fresh.length,
          seen,
        });
    }
    if (looseNew.length)
      photoFindings.push({
        kind: 'photos',
        entryId: null,
        date: d.date,
        time: looseTime,
        count: looseNew.length,
        seen: seenOf('day', d.date),
      });
  }
  const findings = ordered([
    ...photoFindings,
    ...fromProposals(r.proposals),
    ...fromUnvisited(r.unvisited),
    ...fromSuggestions(r.suggestions),
  ]);
  const setAside = ordered([
    ...fromProposals(r.setAside.ignored, 'ignored'),
    ...fromUnvisited(r.setAside.fine, 'fine'),
    ...fromSuggestions(r.setAside.dismissed, 'dismissed'),
    ...hiddenEntries,
  ]);

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
      setAside,
      newPhotoIds,
      segments: r.segments,
      edited,
      hidden: r.hidden,
      cover: typeof cover === 'string' ? cover : null,
      added: Object.fromEntries(r.added.map((a) => [String(a.entryId), a.key])),
    },
  };
}
