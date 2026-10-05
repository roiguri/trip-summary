// What edit mode shows (DESIGN.md, "Edit mode"): the trip merged fresh from its sources and edits,
// and from it the inbox of the Timeline's findings, each day's visits for linking, and what the owner
// has already changed.
import {
  merge,
  type MergeInput,
  type MergeResult,
  type PlacePoint,
  type SegmentView,
  type Suggestion,
} from './merge/index.ts';
import { readSources } from './sources.ts';
import type { Entry, Photo, TransitMode, Trip } from './model.ts';
import type { Store } from './store/index.ts';
import { configuredLookup, placeNames, type NameLookup } from './google/places.ts';
import { timer } from './timing.ts';

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
  /** A stay's actual check-in and check-out from the Timeline (rule 8); null where it can't tell. */
  | {
      kind: 'stay';
      entryId: number;
      title: string;
      date: string;
      checkIn: string | null;
      /** The check-in's day: the next day when the arrival was after midnight. */
      inDate: string;
      checkOut: string | null;
      outDate: string;
    }
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
  /** Photos added and not yet kept, on one entry or loose moment (DESIGN.md, "Photos without
   *  review"). `entryKey`: the drawn entry's ID; `entryId`: a planned entry's, else null. */
  | {
      kind: 'photos';
      entryId: number | null;
      entryKey: string;
      date: string;
      time: string;
      count: number;
      photoIds: string[];
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
  /** Each located planned entry's Google place and position as used (the owner's, else the plan's),
   *  and where entries (by ID) and stops (by key) were before the owner chose their place: for the
   *  place window (DESIGN.md, "Place window"). */
  entryPlaces: Record<string, PlacePoint>;
  placeOverrides: { entries: Record<string, PlacePoint>; suggestions: Record<string, PlacePoint> };
  /** Photos added since last kept: shown with a NEW tag in the editor. */
  newPhotoIds: string[];
  /** How long building this took, step by step (Server-Timing format), for finding what's slow. */
  timing: string;
  /** The media ID of the owner's chosen cover, if any. */
  cover: string | null;
  /** Entry ID → the suggestion an added stop came from (its edits are kept under that key). */
  added: Record<string, string>;
};

/** A stop's photos as sent to the page: a card shows at most six (one stop can have a hundred). */
const firstPhotos = (all: Photo[]) => ({ photos: all.slice(0, 6), photoCount: all.length });

const span = (e: { time: string; end_time: string | null }) =>
  e.end_time ? `${e.time} – ${e.end_time}` : e.time || 'no time';

/** The trip as the editor sees it, and what edit mode needs, merged fresh; null without a plan.
 *  (Edit mode normally reads what the last save stored: `currentEditView` in lib/journal.ts.) */
export async function editView(
  store: Store,
  tripId: string,
  lookup: NameLookup | null = configuredLookup(),
): Promise<{ trip: Trip; edit: EditData } | null> {
  const t = timer();
  const inputs = await readSources(store, tripId);
  if (!inputs) return null;
  t.mark('read');
  const r = merge(inputs);
  t.mark('merge');
  return { trip: r.trip, edit: await editDataFrom(store, tripId, inputs, r, lookup, t) };
}

/** What edit mode needs, from a merge already done: the save computes it with the journal, from the
 *  same merge, so it can't disagree with what viewers see. */
export async function editDataFrom(
  store: Store,
  tripId: string,
  { plan, photos, edits }: MergeInput,
  r: MergeResult,
  lookup: NameLookup | null,
  t = timer(),
): Promise<EditData> {
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
      if (p.stay)
        return [
          {
            kind: 'stay',
            entryId: p.entryId,
            title: e.title,
            date: e.day,
            checkIn: p.stay.checkIn ? p.start : null,
            inDate: p.stay.inDate,
            checkOut: p.stay.checkOut ? p.end : null,
            outDate: p.stay.outDate,
            setAside,
          },
        ];
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
  t.mark('names');
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
    f.kind === 'times' ? f.start : f.kind === 'stay' ? (f.checkIn ?? '') : f.time;
  const ordered = (list: Finding[]) =>
    list.sort((a, b) => a.date.localeCompare(b.date) || timeOf(a).localeCompare(timeOf(b)));
  // New photos: added to the trip and not kept since: by the photo itself ("Keep" marks each), or
  // by an older keep of its whole entry or day.
  const addedAt = new Map(photos.map((p) => [p.mediaId, p.addedAt ?? '']));
  const keptPhotos = new Set(
    edits
      .filter((e) => e.target === 'photo' && e.field === 'seen' && e.value === true)
      .map((e) => e.key),
  );
  const keptAt = (target: 'entry' | 'day', key: string) => {
    const v = edits.find(
      (e) => e.target === target && e.key === key && e.field === 'photosSeen',
    )?.value;
    return typeof v === 'string' ? v : null;
  };
  const newPhotoIds: string[] = [];
  const photoFindings: Finding[] = [];
  for (const d of r.trip.days)
    for (const e of d.entries) {
      if (e.stay?.role === 'checkout') continue;
      const loose = e.type === 'photo' || e.type === 'cluster';
      const planned = /^i\d+$/.test(e.id);
      if (!loose && !planned) continue;
      const whole = loose ? keptAt('day', d.date) : keptAt('entry', e.id.slice(1));
      const fresh = e.photos.filter((p) => {
        const at = addedAt.get(p.id);
        return !!at && !keptPhotos.has(p.id) && (!whole || at > whole);
      });
      if (!fresh.length) continue;
      newPhotoIds.push(...fresh.map((p) => p.id));
      photoFindings.push({
        kind: 'photos',
        entryId: planned ? Number(e.id.slice(1)) : null,
        entryKey: e.id,
        date: d.date,
        time: e.time,
        count: fresh.length,
        photoIds: fresh.map((p) => p.id),
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
    tripId,
    findings,
    setAside,
    newPhotoIds,
    entryPlaces: r.entryPlaces,
    placeOverrides: r.placeOverrides,
    timing: t.header(),
    segments: r.segments,
    edited,
    hidden: r.hidden,
    cover: typeof cover === 'string' ? cover : null,
    added: Object.fromEntries(r.added.map((a) => [String(a.entryId), a.key])),
  };
}
