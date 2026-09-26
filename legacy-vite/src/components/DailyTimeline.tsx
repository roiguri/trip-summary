/**
 * View 1: the daily itinerary - a chronological timeline of the whole trip.
 * Also the review surface: mark highlight days, favorite photos, edit notes
 * and recommendations. Every change is saved by the parent (App) immediately.
 */
import { DayEntry, Trip } from '../types';

interface Props {
  trip: Trip;
  onChange: (trip: Trip) => void;
}

export function DailyTimeline({ trip, onChange }: Props) {
  function updateDay(date: string, updater: (day: DayEntry) => DayEntry) {
    onChange({
      ...trip,
      days: trip.days.map((d) => (d.date === date ? updater(d) : d)),
    });
  }

  if (trip.days.length === 0) {
    return <p className="muted">No days yet. Import data or load the sample above.</p>;
  }

  return (
    <div className="timeline">
      {trip.days.map((day) => (
        <article key={day.date} className={`day ${day.highlight ? 'highlight' : ''}`}>
          <header className="day-header">
            <div>
              <h3>{day.date}{day.title ? ` - ${day.title}` : ''}</h3>
            </div>
            <label className="flag">
              <input
                type="checkbox"
                checked={day.highlight}
                onChange={(e) => updateDay(day.date, (d) => ({ ...d, highlight: e.target.checked }))}
              />
              Highlight day
            </label>
          </header>

          <textarea
            className="notes"
            placeholder="Notes for the day..."
            value={day.notes}
            onChange={(e) => updateDay(day.date, (d) => ({ ...d, notes: e.target.value }))}
          />

          {day.places.length > 0 && (
            <ul className="places">
              {day.places.map((p) => (
                <li key={p.id} className={p.highlight ? 'highlight' : ''}>
                  <div className="place-row">
                    <strong>{p.name}</strong>
                    <span className={`tag cat-${p.category}`}>{p.category}</span>
                    <label className="flag">
                      <input
                        type="checkbox"
                        checked={p.highlight}
                        onChange={(e) =>
                          updateDay(day.date, (d) => ({
                            ...d,
                            places: d.places.map((x) => (x.id === p.id ? { ...x, highlight: e.target.checked } : x)),
                          }))
                        }
                      />
                      Highlight
                    </label>
                  </div>
                  <input
                    className="recommendation"
                    placeholder="Recommendation / review..."
                    value={p.recommendation ?? ''}
                    onChange={(e) =>
                      updateDay(day.date, (d) => ({
                        ...d,
                        places: d.places.map((x) => (x.id === p.id ? { ...x, recommendation: e.target.value } : x)),
                      }))
                    }
                  />
                </li>
              ))}
            </ul>
          )}

          {day.photos.length > 0 && (
            <ul className="photos">
              {day.photos.map((ph) => (
                <li key={ph.id}>
                  <label className="flag">
                    <input
                      type="checkbox"
                      checked={ph.favorite}
                      onChange={(e) =>
                        updateDay(day.date, (d) => ({
                          ...d,
                          photos: d.photos.map((x) => (x.id === ph.id ? { ...x, favorite: e.target.checked } : x)),
                        }))
                      }
                    />
                    Favorite
                  </label>
                  <span>{ph.fileName ?? ph.url}</span>
                  {ph.description && <span className="muted"> - {ph.description}</span>}
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}
