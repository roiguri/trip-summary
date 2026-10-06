// Keeps a trip's journal (the merged, drawable trip) in step with its sources and edits. It is rebuilt
// after every import and edit, so a page view never runs the merge.
import { merge } from './merge/index.ts';
import { editDataFrom, editView, type EditData } from './edit-view.ts';
import { configuredLookup } from './google/places.ts';
import { readSources } from './sources.ts';
import { timer } from './timing.ts';
import type { Trip } from './model.ts';
import { fixtureTrip } from './data.ts';
import type { Store } from './store/index.ts';
import { summarize } from './summary.ts';

/** The journal's format. Raise it when what a journal holds changes (2: photos carry thumbnails;
 *  3: stays' actual times and hotel photos; 4: a stay's check-in day; 5: places chosen in the place
 *  window, and added stops' Google Maps links): an older journal is rebuilt the next time it's read. */
export const JOURNAL_VERSION = 7;

/** Merges the trip's stored sources and edits and stores the result: the journal (written day by
 *  day, only where something changed) and, from the same merge, what edit mode needs. */
export async function rebuildJournal(store: Store, tripId: string) {
  const t = timer();
  const inputs = await readSources(store, tripId);
  if (!inputs) throw new Error(`No plan for "${tripId}": import it first`);
  t.mark('read');
  const r = merge(inputs);
  t.mark('merge');
  const edit = await editDataFrom(store, tripId, inputs, r, configuredLookup(), t);
  const builtAt = new Date().toISOString();
  const { trip, suggestions, proposals, unvisited, orphanEdits } = r;
  const changed = await store.putJournal(tripId, {
    trip,
    suggestions,
    proposals,
    unvisited,
    orphanEdits,
    builtAt,
    version: JOURNAL_VERSION,
  });
  await store.putEditCache(tripId, builtAt, edit);
  await store.setTripSummary(
    tripId,
    summarize(tripId, trip, inputs.edits, {
      hasTimeline: inputs.segments.length > 0,
      hasPhotos: inputs.photos.length > 0,
    }),
  );
  t.mark('write');
  return { trip, edit, builtAt, changed, timing: t.header() };
}

/** The trip's journal, rebuilt first if it's from an older format (and the trip has a plan). */
export async function currentJournal(store: Store, tripId: string) {
  const j = await store.getJournal(tripId);
  if (j && (j.version ?? 1) >= JOURNAL_VERSION) return j;
  if (!(await store.getPlan(tripId))) return j;
  await rebuildJournal(store, tripId);
  return store.getJournal(tripId);
}

/** Edit mode's view: the journal and what the last save computed with it. If that doesn't match the
 *  journal (stale, too large to store, or missing), it is merged fresh. */
export async function currentEditView(
  store: Store,
  tripId: string,
): Promise<{ trip: Trip; edit: EditData } | null> {
  const t = timer();
  const [journal, cache] = await Promise.all([
    currentJournal(store, tripId),
    store.getEditCache(tripId),
  ]);
  t.mark('read');
  if (journal && cache && cache.builtAt === journal.builtAt)
    return { trip: journal.trip, edit: { ...(cache.data as EditData), timing: t.header() } };
  return editView(store, tripId);
}

/** Stores a trip file (data/README.md) as a published trip with a ready-made journal: the sample
 *  fixture, published so viewers' access can be checked against it. */
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
    proposals: [],
    unvisited: [],
    orphanEdits: [],
    builtAt: new Date().toISOString(),
    version: JOURNAL_VERSION,
  });
  // A trip file is a whole trip: it stands for all three sources.
  await store.setTripSummary(
    tripId,
    summarize(tripId, trip, [], {
      hasTimeline: true,
      hasPhotos: trip.days.some((d) => d.entries.some((e) => e.photos.length)),
    }),
  );
  await store.setTripStatus(tripId, 'published');
}
