import type { Trip } from '../../lib/store/types';
import { dayCount, tripDates } from '../../lib/trip-labels';

/** The paper cover of a trip with no photos yet: its destination over a faint dotted route. */
function PaperCover({ label }: { label: string }) {
  return (
    <div className="paper-cover">
      <svg viewBox="0 0 300 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path
          d="M-10 120 C 60 100, 80 40, 150 60 S 250 30, 320 20"
          fill="none"
          stroke="#9cb7a0"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="0 11"
        />
        <circle cx="150" cy="60" r="7" fill="#fffdfa" stroke="#b98468" strokeWidth="2.5" />
        <circle cx="255" cy="31" r="5" fill="#fffdfa" stroke="#b98468" strokeWidth="2" />
      </svg>
      <span className="paper-label">{label}</span>
    </div>
  );
}

/** What a draft still needs, or what a trip holds. */
function holds(t: Trip) {
  const s = t.summary;
  if (t.status === 'draft') {
    const missing = [!s?.hasTimeline && 'Timeline', !s?.hasPhotos && 'photos'].filter(Boolean);
    if (missing.length) return `Plan only · add ${missing.join(', ')}`;
  }
  return s ? `${s.photos} photos · ${s.stops} stops` : '';
}

/** One trip on the home page (DESIGN.md, "Home (H1)"). `viewers` is given to editors only. */
export function TripCard({
  trip,
  editor,
  viewers,
}: {
  trip: Trip;
  editor: boolean;
  viewers: number;
}) {
  const meta = [
    tripDates(trip.startDate, trip.endDate),
    dayCount(trip.startDate, trip.endDate),
    trip.destinationName.toUpperCase(),
  ]
    .filter(Boolean)
    .join(' · ');
  const who =
    trip.status === 'draft' ? 'Only editors' : viewers === 1 ? '1 viewer' : `${viewers} viewers`;
  return (
    <a className="trip-card" href={`/trips/${encodeURIComponent(trip.tripId)}`}>
      <div className="trip-cover">
        {trip.summary?.cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- stored media, served as is
          <img src={trip.summary.cover} alt="" />
        ) : (
          <PaperCover label={trip.destinationName} />
        )}
        {editor && (
          <span className={`trip-status ${trip.status}`}>
            {trip.status === 'draft' ? 'DRAFT' : 'PUBLISHED'}
          </span>
        )}
      </div>
      <div className="trip-body">
        <strong>{trip.title}</strong>
        <small>{meta}</small>
        <div className="trip-meta">
          <span>{holds(trip)}</span>
          {editor && <span>{who}</span>}
        </div>
      </div>
    </a>
  );
}
