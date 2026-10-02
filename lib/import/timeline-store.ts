// Stores a Timeline slice made by sliceTimeline (lib/import/timeline.ts), usually in the browser.
import type { Store, TimelineSegment } from '../store/index.ts';
import { rebuildJournal } from '../journal.ts';
import { sliceWindow } from './timeline.ts';

export class TimelineImportError extends Error {}

export async function importTimeline(
  store: Store,
  tripId: string,
  segments: TimelineSegment[],
  by: string,
) {
  const trip = await store.getTrip(tripId);
  if (!trip) throw new TimelineImportError(`No trip "${tripId}": import its plan first`);
  if (trip.status === 'published')
    throw new TimelineImportError(
      `"${tripId}" is published: re-importing it needs the import review`,
    );
  // The slice is made on the owner's device; check it really is only the trip's dates, so no more of
  // their location history is ever stored than the design allows.
  const { from, to } = sliceWindow(trip);
  const outside = segments.filter(
    (s) => Date.parse(s.endUtc) < from || Date.parse(s.startUtc) >= to,
  );
  if (outside.length)
    throw new TimelineImportError(
      `${outside.length} segments fall outside the trip's dates; slice the export first`,
    );

  const before = new Set((await store.listTimeline(tripId)).map((s) => s.key));
  const after = new Set(segments.map((s) => s.key));
  await store.replaceTimeline(tripId, segments);
  const summary = {
    visits: segments.filter((s) => s.kind === 'visit').length,
    activities: segments.filter((s) => s.kind === 'activity').length,
    added: [...after].filter((k) => !before.has(k)).length,
    removed: [...before].filter((k) => !after.has(k)).length,
  };
  const record = await store.recordImport(tripId, {
    source: 'timeline',
    by,
    summary,
    state: 'applied',
  });
  await rebuildJournal(store, tripId);
  return { summary, record };
}
