import { useEffect, useState } from 'react';
import { Trip } from './types';
import { clearTrip, exportTripToFile, loadTrip, saveTrip } from './lib/storage';
import { ImportPanel } from './components/ImportPanel';
import { DailyTimeline } from './components/DailyTimeline';
import { CategoryView } from './components/CategoryView';

type View = 'itinerary' | 'categories';

export default function App() {
  const [trip, setTrip] = useState<Trip | null>(() => loadTrip());
  const [view, setView] = useState<View>('itinerary');

  // Persist every change immediately - the app is meant for multi-day,
  // multi-session review, so an accidental tab close must not lose work.
  useEffect(() => {
    if (trip) saveTrip(trip);
  }, [trip]);

  return (
    <div className="app">
      <header className="app-header">
        <input
          className="trip-name"
          value={trip?.name ?? ''}
          placeholder="Name your trip"
          onChange={(e) => setTrip((t) => (t ? { ...t, name: e.target.value } : t))}
        />
        <nav>
          <button className={view === 'itinerary' ? 'active' : ''} onClick={() => setView('itinerary')}>
            Daily itinerary
          </button>
          <button className={view === 'categories' ? 'active' : ''} onClick={() => setView('categories')}>
            By category
          </button>
        </nav>
        <div className="header-actions">
          {trip && (
            <>
              <button className="secondary" onClick={() => exportTripToFile(trip)}>Export JSON</button>
              <button
                className="secondary danger"
                onClick={() => {
                  if (confirm('Delete the locally stored trip from this browser?')) {
                    clearTrip();
                    setTrip(null);
                  }
                }}
              >
                Clear local data
              </button>
            </>
          )}
        </div>
      </header>

      <ImportPanel trip={trip} onTrip={setTrip} />

      {trip && (
        <main>
          <p className="muted">
            {trip.days.length} days{trip.startDate ? `, ${trip.startDate} to ${trip.endDate}` : ''}. Saved locally
            {trip.updatedAt ? ` at ${new Date(trip.updatedAt).toLocaleString()}` : ''}.
          </p>
          {view === 'itinerary' ? (
            <DailyTimeline trip={trip} onChange={setTrip} />
          ) : (
            <CategoryView trip={trip} />
          )}
        </main>
      )}
    </div>
  );
}
