import { notFound, redirect } from 'next/navigation';
import { canCreateTrips, currentAccount } from '../../../lib/auth/session';
import { TripHeader } from '../../components/TripHeader';
import { NewTripForm } from './NewTripForm';

export default async function NewTrip() {
  if (!(await currentAccount())) redirect('/sign-in?next=/trips/new');
  if (!(await canCreateTrips())) notFound();
  return (
    <div className="home-page">
      <TripHeader crumbs={[{ label: 'TRIPS', href: '/' }, { label: 'NEW TRIP' }]} />
      <main className="sources">
        <small className="sources-kicker">A NEW JOURNEY</small>
        <h1>Start with the plan</h1>
        <p className="sources-lede">
          Choose your Jarvis travel database and pick the trip. The file is read only to find its
          trips; nothing in Jarvis changes.
        </p>
        <NewTripForm />
      </main>
    </div>
  );
}
