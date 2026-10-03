import { notFound, redirect } from 'next/navigation';
import { getStore } from '../../../../lib/store';
import { accessToTrip, currentAccount } from '../../../../lib/auth/session';
import { previewPending } from '../../../../lib/import/stage';
import { review } from '../../../../lib/review';
import { tripDates } from '../../../../lib/trip-labels';
import { TripHeader } from '../../../components/TripHeader';
import { PlanRow } from './PlanRow';
import { TimelineRow } from './TimelineRow';
import { ReviewPanel } from './ReviewPanel';
import { PhotosRow } from './PhotosRow';
import { photosConnected } from '../../../../lib/google/choose';
import { emulated } from '../../../../lib/firebase-admin';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }) + ' UTC';

// The import page (DESIGN.md, "Adding (A3)"): the trip's three sources, one under another, and the
// review of an import waiting below them.
export default async function Sources({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  if (!(await currentAccount()))
    redirect(`/sign-in?next=${encodeURIComponent(`/trips/${tripId}/sources`)}`);
  const access = await accessToTrip(tripId);
  if (access?.access !== 'edit') notFound();
  const { trip } = access;
  const store = getStore();
  const [plan, segments, photos, imports, waiting] = await Promise.all([
    store.getPlan(tripId),
    store.listTimeline(tripId),
    store.listPhotos(tripId),
    store.listImports(tripId),
    store.listPending(tripId),
  ]);
  const copying = waiting.find((p) => p.source === 'photos' && p.done + p.failed < p.total);
  const reviews = await Promise.all(
    waiting
      .filter((p) => p !== copying)
      .map(async (p) => ({
        source: p.source,
        preview: await previewPending(store, tripId, p.source),
      })),
  );
  const last = (source: string) =>
    imports.find((i) => i.source === source && i.state === 'applied');
  const planStatus = plan
    ? `${plan.itinerary.filter((r) => r.item_type !== 'tag').length} entries · imported ${when(plan.importedAt)}`
    : 'Not imported';
  const tl = last('timeline');
  const timelineStatus = segments.length
    ? `${segments.length} visits and journeys${tl ? ` · added ${when(tl.at)}` : ''}`
    : null;

  return (
    <div className="home-page">
      <TripHeader
        crumbs={[
          { label: 'TRIPS', href: '/' },
          { label: trip.title.toUpperCase(), href: `/trips/${encodeURIComponent(tripId)}` },
          { label: 'ADD SOURCES' },
        ]}
        status={trip.status}
        right={
          <a className="pill-button small" href={`/trips/${encodeURIComponent(tripId)}`}>
            Back to the journey
          </a>
        }
      />
      <main className="sources">
        <small className="sources-kicker">
          {trip.title.toUpperCase()} · {tripDates(trip.startDate, trip.endDate)}
        </small>
        <h1>Sources</h1>
        <p className="sources-lede">
          Add them in any order, as often as you like. Each import shows what it changes before it’s
          applied.
        </p>
        <div className="src-rows">
          <PlanRow tripId={tripId} status={planStatus} />
          <TimelineRow
            tripId={tripId}
            trip={{ startDate: trip.startDate, endDate: trip.endDate, timezone: trip.timezone }}
            status={timelineStatus}
          />
          <PhotosRow
            tripId={tripId}
            title={trip.title}
            copying={!!copying}
            status={photos.length ? `${photos.length} photos and videos` : null}
            connected={await photosConnected()}
            mock={emulated()}
          />
        </div>
        {copying?.source === 'photos' && (
          <p className="src-run quiet" id="review-title">
            Copying photos: {copying.done} of {copying.total}. Their review appears here when
            they’re all in; meanwhile you can review the other sources.
          </p>
        )}
        {reviews.map(
          ({ source, preview }) =>
            preview && (
              <ReviewPanel
                key={source}
                tripId={tripId}
                source={source}
                review={review(preview.before, preview.after)}
                published={trip.status === 'published'}
              />
            ),
        )}
        {!waiting.length && (
          <p className="src-run quiet" id="review-title">
            Nothing to review. After an import, its changes appear here, under the sources.
          </p>
        )}{' '}
      </main>
    </div>
  );
}
