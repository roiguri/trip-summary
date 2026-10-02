// Keeps a trip's journal (the merged, drawable trip) in step with its sources and edits. It is rebuilt
// after every import and edit, so a page view never runs the merge.
import { merge } from './merge/index.ts';
import { fixtureTrip } from './data.ts';
import type { Store } from './store/index.ts';

/** Merges the trip's stored sources and edits and stores the result. */
export async function rebuildJournal(store: Store, tripId: string) {
  const [plan, segments, photos, edits] = await Promise.all([
    store.getPlan(tripId),
    store.listTimeline(tripId),
    store.listPhotos(tripId),
    store.listEdits(tripId),
  ]);
  if (!plan) throw new Error(`No plan for "${tripId}": import it first`);
  const { trip, suggestions, orphanEdits } = merge({ plan, segments, photos, edits });
  await store.putJournal(tripId, {
    trip,
    suggestions,
    orphanEdits,
    builtAt: new Date().toISOString(),
  });
}

/** Stores a trip file (data/README.md) as a trip with a ready-made journal: the sample fixture. */
export async function storeFixture(store: Store, file: string, tripId: string) {
  const trip = fixtureTrip(file);
  await store.putTrip({
    tripId,
    title: trip.title,
    destinationName: trip.destination.name,
    timezone: trip.timezone,
    startDate: trip.days[0]?.date ?? null,
    endDate: trip.days[trip.days.length - 1]?.date ?? null,
  });
  await store.putJournal(tripId, {
    trip,
    suggestions: [],
    orphanEdits: [],
    builtAt: new Date().toISOString(),
  });
}
