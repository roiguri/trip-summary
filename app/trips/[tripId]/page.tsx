import { notFound, redirect } from 'next/navigation';
import { getStore } from '../../../lib/store';
import { accessToTrip, currentAccount } from '../../../lib/auth/session';
import Client from '../../Client';

export default async function TripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  if (!(await currentAccount()))
    redirect(`/sign-in?next=${encodeURIComponent(`/trips/${tripId}`)}`);
  // A trip you can't see and a trip that doesn't exist look the same.
  if (!(await accessToTrip(tripId))) notFound();
  const journal = await getStore().getJournal(tripId);
  if (!journal) notFound();
  return <Client trip={journal.trip} />;
}
