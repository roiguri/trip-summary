// Imports a trip's plan from a Jarvis database file into the store (lib/import/plan.ts). Run it with
// the emulators up (npm run emulators, then FIRESTORE_EMULATOR_HOST=127.0.0.1:8080). The file is
// only ever read.
//   node scripts/import-plan.ts <jarvis.sqlite>                  # list its trips
//   node scripts/import-plan.ts <jarvis.sqlite> --trip <trip_id> # import one
import { getStore } from '../lib/store/index.ts';
import { importPlan, listJarvisTrips } from '../lib/import/plan.ts';

const [file] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
if (!file) {
  console.error('Usage: node scripts/import-plan.ts <jarvis.sqlite> [--trip <trip_id>]');
  process.exit(1);
}
const tripId = flag('trip');
if (!tripId) {
  for (const t of listJarvisTrips(file))
    console.log(
      `${t.isCurrent ? '*' : ' '} ${t.tripId}  ${t.title ?? t.destination}  ${t.startDate ?? '?'} → ${t.endDate ?? '?'}  (${t.entries} entries)`,
    );
} else {
  const { trip, summary } = await importPlan(
    getStore(),
    file,
    tripId,
    flag('by') ?? 'command line',
  );
  console.log(`Imported "${trip.title}" (${trip.status}):`, summary);
}
