import { redirect } from 'next/navigation';
import { Notice } from './components/Notice';
import { currentAccount, visibleTrips } from '../lib/auth/session';

// Until the home page lists trips (Phase 2, step 7b), it opens the newest trip you can see.
export default async function Home() {
  if (!(await currentAccount())) redirect('/sign-in');
  const [newest] = await visibleTrips();
  if (newest) redirect(`/trips/${encodeURIComponent(newest.trip.tripId)}`);
  return (
    <Notice title="No trips to show yet">
      <p>
        When someone shares a trip with you, it appears here. If you were sent a link, open it on
        this device.
      </p>
    </Notice>
  );
}
