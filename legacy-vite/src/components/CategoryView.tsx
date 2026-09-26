/**
 * View 2: the trip by category - every visited place grouped under
 * restaurant / attraction / accommodation / ... so recommendations
 * are easy to scan and share.
 */
import { ALL_CATEGORIES, Trip } from '../types';

export function CategoryView({ trip }: { trip: Trip }) {
  const places = trip.days.flatMap((d) => d.places.map((p) => ({ ...p, date: d.date })));

  if (places.length === 0) {
    return <p className="muted">No places yet. Import data or load the sample above.</p>;
  }

  return (
    <div className="categories">
      {ALL_CATEGORIES.map((cat) => {
        const inCat = places.filter((p) => p.category === cat);
        if (inCat.length === 0) return null;
        return (
          <section key={cat} className="panel">
            <h3>
              {cat} <span className="muted">({inCat.length})</span>
            </h3>
            <ul>
              {inCat.map((p) => (
                <li key={p.id}>
                  <strong>{p.name}</strong>
                  <span className="muted"> - {p.date}</span>
                  {p.highlight && <span className="badge">highlight</span>}
                  {p.rating != null && <span className="badge">{'*'.repeat(p.rating)}</span>}
                  {p.recommendation && <p className="rec">{p.recommendation}</p>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
