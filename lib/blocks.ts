// Blocks (DESIGN.md, "Blocks"): the owner groups entries into one larger event, a bike ride or a
// trek. A block is the owner's edits (target "block": title, emoji, colour, note) and the entries
// attached to it (an entry's "block" edit, an added stop's, or a loose photo's for its moment). It runs from its first attached entry
// to its last, across days if need be, and everything between belongs to it: loose photos, legs,
// stops added from the Timeline, other entries. Applied after the trip is built, from the same edits.
import type { Block, Trip } from './model.ts';
import type { Edit } from './store/types.ts';

/** The colours a block can take: the app's palette. */
export const BLOCK_COLORS: Record<string, string> = {
  teal: '#3f8f86',
  copper: '#b0734f',
  olive: '#7a8f3f',
  plum: '#8f6a9a',
  blue: '#3f6a8f',
  ochre: '#b5893a',
};

/** Marks each entry in a block's range with the block, and lists the blocks on the trip.
 *  `addedStops`: a stop added from the Timeline, by its suggestion's key → its entry's ID. */
export function applyBlocks(trip: Trip, edits: Edit[], addedStops: Map<string, string>) {
  const defined = new Map<string, Record<string, unknown>>();
  for (const e of edits)
    if (e.target === 'block') defined.set(e.key, { ...defined.get(e.key), [e.field]: e.value });
  if (!defined.size) return;

  // A loose photo's moment, by the photo: moments are regrouped as photos come and go.
  const moment = new Map<string, string>();
  for (const d of trip.days)
    for (const e of d.entries)
      if (e.type === 'photo' || e.type === 'cluster')
        for (const p of e.photos) moment.set(p.id, e.id);

  // Attached entries, by their drawn ID: a planned entry's "i<n>", an added stop's "i-<n>", a
  // loose moment's "p<n>" or "c<n>".
  const members = new Map<string, string[]>();
  for (const e of edits) {
    if (e.field !== 'block' || typeof e.value !== 'string' || !defined.has(e.value)) continue;
    const id =
      e.target === 'entry'
        ? `i${e.key}`
        : e.target === 'suggestion'
          ? addedStops.get(e.key)
          : e.target === 'photo'
            ? moment.get(e.key)
            : null;
    if (id) members.set(e.value, [...(members.get(e.value) ?? []), id]);
  }

  // Each entry's position on the journey: its day, then its place in the day.
  const at = new Map<string, [number, number]>();
  trip.days.forEach((d, di) =>
    d.entries.forEach((e, ei) => {
      if (e.stay?.role !== 'checkout') at.set(e.id, [di, ei]);
    }),
  );
  const before = (a: [number, number], b: [number, number]) =>
    a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]);

  const ranges = [...members]
    .map(([id, ids]) => {
      const spots = ids.flatMap((x) => (at.has(x) ? [at.get(x)!] : []));
      if (!spots.length) return null;
      spots.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      return { id, from: spots[0], to: spots[spots.length - 1] };
    })
    .filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) => a.from[0] - b.from[0] || a.from[1] - b.from[1]);

  const blocks: Block[] = [];
  for (const r of ranges) {
    const inside: { day: string; e: Trip['days'][number]['entries'][number] }[] = [];
    trip.days.forEach((d, di) =>
      d.entries.forEach((e, ei) => {
        // An entry already in an earlier block stays there (blocks don't overlap).
        if (e.block || !before(r.from, [di, ei]) || !before([di, ei], r.to)) return;
        e.block = r.id;
        inside.push({ day: d.date, e });
      }),
    );
    if (!inside.length) continue;
    const def = defined.get(r.id)!;
    const first = inside[0];
    const last = inside[inside.length - 1];
    blocks.push({
      id: r.id,
      title: typeof def.title === 'string' && def.title ? def.title : 'A block',
      emoji: typeof def.emoji === 'string' ? def.emoji : '',
      color: BLOCK_COLORS[String(def.color)] ?? BLOCK_COLORS.teal,
      note: typeof def.note === 'string' ? def.note : '',
      days: [...new Set(inside.map((x) => x.day))],
      start: { date: first.day, time: first.e.time },
      end: { date: last.day, time: last.e.end_time ?? last.e.time },
      stops: inside.filter(
        (x) => x.e.type === 'place' || (x.e.type === 'lodging' && x.e.stay?.role !== 'checkout'),
      ).length,
      photos: inside.reduce((n, x) => n + x.e.photos.length, 0),
      ...(def.collapsed === true ? { collapsed: true as const } : {}),
      ...(typeof def.photos === 'string' && def.photos ? { shown: def.photos.split(',') } : {}),
    });
  }
  if (blocks.length) trip.blocks = blocks;
}

/** A block's contact sheet: the owner's chosen photos first, in order, then highlights, then the
 *  rest in time order; six at most. */
export function sheetPhotos<P extends { id: string; highlighted?: true }>(
  photos: P[],
  shown: string[] = [],
  n = 6,
): P[] {
  const rank = (p: P) =>
    shown.includes(p.id) ? shown.indexOf(p.id) : shown.length + (p.highlighted ? 0 : 1);
  return photos
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
    .slice(0, n)
    .map((x) => x.p);
}
