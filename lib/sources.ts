// A trip's sources and edits, read together: what the merge takes (docs/DATA-DESIGN.md).
import type { MergeInput } from './merge/index.ts';
import type { Store } from './store/index.ts';

/** The merge's input for a trip, or null before its plan is imported. */
export async function readSources(store: Store, tripId: string): Promise<MergeInput | null> {
  const [plan, segments, photos, edits] = await Promise.all([
    store.getPlan(tripId),
    store.listTimeline(tripId),
    store.listPhotos(tripId),
    store.listEdits(tripId),
  ]);
  return plan ? { plan, segments, photos, edits } : null;
}
