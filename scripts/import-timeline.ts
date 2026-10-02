// Slices an Android Timeline export to a trip's dates and stores the slice (lib/import/timeline.ts).
// Run it with the emulators up (FIRESTORE_EMULATOR_HOST=127.0.0.1:8080), after the trip's plan.
//   node scripts/import-timeline.ts <Timeline.json> --trip <trip_id>
import { readFileSync } from 'node:fs';
import { getStore } from '../lib/store/index.ts';
import { sliceTimeline } from '../lib/import/timeline.ts';
import { importTimeline } from '../lib/import/timeline-store.ts';

const file = process.argv[2];
const i = process.argv.indexOf('--trip');
const tripId = i > 0 ? process.argv[i + 1] : undefined;
if (!file || !tripId) {
  console.error('Usage: node scripts/import-timeline.ts <Timeline.json> --trip <trip_id>');
  process.exit(1);
}
const store = getStore();
const trip = await store.getTrip(tripId);
if (!trip) {
  console.error(`No trip "${tripId}": import its plan first`);
  process.exit(1);
}
const slice = sliceTimeline(JSON.parse(readFileSync(file, 'utf8')), trip);
const { summary } = await importTimeline(store, tripId, slice, 'command line');
console.log(`Stored the Timeline slice for "${trip.title}":`, summary);
