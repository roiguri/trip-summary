import { getStore } from '../lib/store';
import Client from './Client';

// Read the store on every request, so an import shows up without a rebuild.
export const dynamic = 'force-dynamic';

export default async function Page() {
  const store = getStore();
  // Until the home page lists trips, the page shows TRIP_ID, or else the trip starting latest.
  const tripId = process.env.TRIP_ID ?? (await store.listTrips())[0]?.tripId;
  const journal = tripId ? await store.getJournal(tripId) : null;
  if (!journal)
    return (
      <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
        No trip yet. With the emulators running, add one with <code>npm run seed</code>.
      </main>
    );
  return <Client trip={journal.trip} />;
}
