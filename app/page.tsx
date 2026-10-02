import { redirect } from 'next/navigation';
import { Notice } from './components/Notice';
import { HomeHeader } from './components/HomeHeader';
import { TripCard } from './components/TripCard';
import { getStore } from '../lib/store';
import { canCreateTrips, currentAccount, visibleTrips } from '../lib/auth/session';
import { journeys } from '../lib/trip-labels';

// The home page (DESIGN.md, "Home, adding a trip and imports"): your trips, newest first.
export default async function Home() {
  const account = await currentAccount();
  if (!account) redirect('/sign-in');
  const [trips, canCreate] = await Promise.all([visibleTrips(), canCreateTrips()]);
  const name = account.name ?? account.email ?? 'Signed in';

  if (!trips.length)
    return canCreate ? (
      <Notice title="No trips yet" header={<HomeHeader name={name} canCreate={false} />}>
        <p>Start with a trip’s plan from Jarvis.</p>
        <a className="notice-button" href="/trips/new">
          + New trip
        </a>
      </Notice>
    ) : (
      <Notice title="No trips to show yet" header={<HomeHeader name={name} canCreate={false} />}>
        <p>
          When someone shares a trip with you, it appears here. If you were sent a link, open it on
          this device.
        </p>
      </Notice>
    );

  // Who can see each trip, for the editors' cards.
  const store = getStore();
  const viewers = await Promise.all(
    trips.map(async ({ trip, access }) =>
      access === 'edit'
        ? (await store.listPeople(trip.tripId)).filter((p) => p.role === 'viewer' && !p.revokedAt)
            .length
        : 0,
    ),
  );
  const published = trips.filter((t) => t.trip.status === 'published').length;
  const drafts = trips.length - published;
  const editsAny = trips.some((t) => t.access === 'edit');
  return (
    <div className="home-page">
      <HomeHeader name={name} canCreate={canCreate} />
      <main className="home">
        <div className="home-intro">
          <small>YOUR TRIPS</small>
          <h1>{journeys(trips.length)}</h1>
          <p>
            {[
              'Newest first',
              editsAny && `${published} published`,
              editsAny && drafts && `${drafts} ${drafts === 1 ? 'draft' : 'drafts'}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="shelf">
          {trips.map(({ trip, access }, i) => (
            <TripCard
              key={trip.tripId}
              trip={trip}
              editor={access === 'edit'}
              viewers={viewers[i]}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
