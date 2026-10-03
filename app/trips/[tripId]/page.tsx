import { notFound, redirect } from 'next/navigation';
import { getStore } from '../../../lib/store';
import { accessToTrip, currentAccount } from '../../../lib/auth/session';
import { previewPending } from '../../../lib/import/stage';
import { review } from '../../../lib/review';
import { EditorBar, type SharedWith } from '../../components/EditorBar';
import { editView } from '../../../lib/edit-view';
import Client from '../../Client';

const opened = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ view?: string; edit?: string }>;
}) {
  const { tripId } = await params;
  const account = await currentAccount();
  if (!account) redirect(`/sign-in?next=${encodeURIComponent(`/trips/${tripId}`)}`);
  // A trip you can't see and a trip that doesn't exist look the same.
  const access = await accessToTrip(tripId);
  if (!access) notFound();
  const store = getStore();
  const journal = await store.getJournal(tripId);
  if (!journal) notFound();
  const name = account.name ?? account.email ?? 'Signed in';
  // An editor previewing sees exactly what a viewer does, with a way back.
  const query = await searchParams;
  const previewing = query.view === 'viewer';
  if (access.access !== 'edit' || previewing)
    return (
      <>
        <Client trip={journal.trip} account={name} />
        {previewing && access.access === 'edit' && (
          <a
            className="pill-button primary preview-exit"
            href={`/trips/${encodeURIComponent(tripId)}`}
          >
            Exit the viewer’s preview
          </a>
        )}
      </>
    );

  // Edit mode (DESIGN.md, "Edit mode"): the trip merged fresh, with what edit mode needs.
  if (query.edit === '1') {
    const view = await editView(store, tripId);
    if (view)
      return (
        <Client
          trip={view.trip}
          account={name}
          edit={view.edit}
          bar={
            <EditorBar
              key="bar"
              tripId={tripId}
              status={access.trip.status}
              waiting={null}
              people={[]}
              editing
            />
          }
        />
      );
  }

  // A waiting import's count of changes, for "Review waiting" (a photo import counts its photos).
  const [people, waitingImports] = await Promise.all([
    store.listPeople(tripId),
    store.listPending(tripId),
  ]);
  const counts = await Promise.all(
    waitingImports.map(async (p) => {
      if (p.source === 'photos') return p.total;
      const preview = await previewPending(store, tripId, p.source);
      return preview
        ? Object.values(review(preview.before, preview.after).counts).reduce((a, b) => a + b, 0)
        : 0;
    }),
  );
  const waiting = waitingImports.length ? counts.reduce((a, b) => a + b, 0) : null;
  const shared: SharedWith[] = people
    .filter((p) => p.role === 'viewer' && !p.revokedAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((p) => ({
      personId: p.personId,
      name: p.name,
      opened: p.lastOpenedAt ? opened(p.lastOpenedAt) : null,
      google: !!p.email,
    }));
  return (
    <Client
      trip={journal.trip}
      account={name}
      bar={
        <EditorBar
          key="bar"
          tripId={tripId}
          status={access.trip.status}
          waiting={waiting}
          people={shared}
        />
      }
    />
  );
}
