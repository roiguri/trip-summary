'use client';
import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { PlaceChoice, PlacePrediction } from '../../../lib/google/places';
import { distance, metres } from './useSave';

maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

type Point = { lat: number; lng: number };
/** What the owner chose: a Google place, or a pin placed by hand (`id` empty, no name). */
export type ChosenPlace = { id: string; name: string | null; lat: number; lng: number };

/** The place window (DESIGN.md, "Place window"): where an entry or a stop really was. A map with
 *  the plan's pin, where the Timeline put the visit, and the chosen place; Google's places nearby;
 *  a search near there; or a pin placed by hand. Nothing changes until "Use this place". */
export function PlaceWindow({
  tripId,
  kind,
  title,
  planned,
  visit,
  current,
  onUse,
  onBack,
  onClose,
  busy,
}: {
  tripId: string;
  kind: 'entry' | 'stop';
  /** What the place is for, in the heading. */
  title: string;
  /** The plan's pin (entries). */
  planned: Point | null;
  /** Where the Timeline put the visit. */
  visit: Point | null;
  /** The place as used now. */
  current: (Point & { placeId: string | null }) | null;
  /** Saves the choice; for an entry, whether to take Google's name too. */
  onUse: (place: ChosenPlace, useName: boolean) => Promise<boolean>;
  /** Undoes an earlier choice (shown only when there was one). */
  onBack?: () => void;
  onClose: () => void;
  busy: boolean;
}) {
  // Search around where the owner actually was: the visit, else the plan's pin, else the place now.
  const centre = visit ?? planned ?? current;
  const [nearby, setNearby] = useState<PlaceChoice[] | null>(null);
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [chosen, setChosen] = useState<ChosenPlace | null>(null);
  const [useName, setUseName] = useState(kind === 'stop');
  const [error, setError] = useState<string | null>(null);
  const api = `/api/trips/${encodeURIComponent(tripId)}/places`;
  const post = async (path: string, body: object) => {
    const r = await fetch(`${api}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!r?.ok) throw new Error(r ? await r.text() : 'Not reachable: check the connection.');
    return r.json();
  };

  useEffect(() => {
    if (!centre) return;
    let gone = false;
    post('nearby', centre)
      .then((b: { places: PlaceChoice[] }) => !gone && setNearby(b.places))
      .catch((e: Error) => !gone && (setNearby([]), setError(e.message)));
    return () => {
      gone = true;
    };
    // The centre is fixed while the window is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search as the owner types (after a short pause).
  useEffect(() => {
    if (!centre || query.trim().length < 2) {
      setPredictions([]);
      return;
    }
    const t = setTimeout(() => {
      post('search', { ...centre, input: query })
        .then((b: { predictions: PlacePrediction[] }) => setPredictions(b.predictions))
        .catch((e: Error) => setError(e.message));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const pick = (p: PlaceChoice) => setChosen({ id: p.id, name: p.name, lat: p.lat, lng: p.lng });
  const pickPrediction = async (p: PlacePrediction) => {
    try {
      const b = (await post('details', { placeId: p.placeId })) as { place: PlaceChoice | null };
      if (b.place) pick(b.place);
      else setError('Google has no position for that place.');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const away = (p: Point) => (centre ? distance(metres(centre.lat, centre.lng, p.lat, p.lng)) : '');

  return (
    <section className="editor place-window" aria-label={`Where ${title} was`}>
      <div className="ed-kick">
        <span>THE PLACE · {title.toUpperCase()}</span>
        <button className="link-button" onClick={onClose}>
          Back
        </button>
      </div>
      <PlaceMap
        planned={planned}
        visit={visit}
        current={current}
        chosen={chosen}
        onPin={(p) => setChosen({ id: '', name: null, ...p })}
      />
      <p className="pw-legend">
        {planned && (
          <span>
            <i className="mini-pin plan" /> the plan
          </span>
        )}
        {visit && (
          <span>
            <i className="mini-pin visit" /> where you were
          </span>
        )}
        <span>
          <i className="mini-pin" /> {chosen ? 'chosen' : 'now'}
        </span>
        <small>Click the map or drag the pin to place it by hand.</small>
      </p>
      <label className="ed-field">
        Search near here
        <input
          id="pw-search"
          value={query}
          placeholder="A name, e.g. Longshan Temple"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {predictions.length > 0 && (
        <div className="pw-list" role="list" aria-label="Search results">
          {predictions.map((p) => (
            <button key={p.placeId} role="listitem" onClick={() => pickPrediction(p)}>
              <b>{p.main}</b>
              <span>{p.secondary}</span>
            </button>
          ))}
        </div>
      )}
      <div className="pw-list" role="list" aria-label="Places nearby">
        <small>NEARBY</small>
        {nearby === null && <span className="pw-wait">Looking around…</span>}
        {nearby?.length === 0 && !error && <span className="pw-wait">No places found nearby.</span>}
        {nearby?.map((p) => (
          <button
            key={p.id}
            role="listitem"
            className={chosen?.id === p.id ? 'on' : ''}
            aria-pressed={chosen?.id === p.id}
            onClick={() => pick(p)}
          >
            <b>{p.name}</b>
            <span>
              {p.type} · {away(p)}
            </span>
          </button>
        ))}
      </div>
      {chosen && (
        <div className="pw-chosen">
          <b>{chosen.name ?? 'A pin placed by hand'}</b>
          <small>
            {chosen.id ? 'Google place' : 'no Google place'}
            {centre ? ` · ${away(chosen)} from where you were` : ''}
          </small>
          {kind === 'entry' && chosen.name && (
            <span className="ed-row" role="radiogroup" aria-label="Its name">
              <button
                role="radio"
                aria-checked={!useName}
                className={`radio ${useName ? '' : 'on'}`}
                onClick={() => setUseName(false)}
              >
                Keep the plan’s name
              </button>
              <button
                role="radio"
                aria-checked={useName}
                className={`radio ${useName ? 'on' : ''}`}
                onClick={() => setUseName(true)}
              >
                Use Google’s name
              </button>
            </span>
          )}
          <span className="acts">
            <button
              className="pill-button small primary"
              disabled={busy}
              onClick={() => onUse(chosen, useName).then((ok) => ok && onClose())}
            >
              Use this place
            </button>
            <button className="link-button" onClick={() => setChosen(null)}>
              Clear
            </button>
          </span>
        </div>
      )}
      {onBack && (
        <button className="link-button" disabled={busy} onClick={onBack}>
          {kind === 'entry' ? 'Back to the plan’s place' : 'Back to the Timeline’s place'}
        </button>
      )}
      {error && (
        <p className="src-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** The window's map: the plan's pin, the visit, the place now, and the chosen pin (draggable). */
function PlaceMap({
  planned,
  visit,
  current,
  chosen,
  onPin,
}: {
  planned: Point | null;
  visit: Point | null;
  current: Point | null;
  chosen: Point | null;
  onPin: (p: Point) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const pin = useRef<maplibregl.Marker | null>(null);
  const onPinRef = useRef(onPin);
  onPinRef.current = onPin;
  const dot = (cls: string) => Object.assign(document.createElement('span'), { className: cls });

  useEffect(() => {
    if (!box.current) return;
    const points = [planned, visit, current].filter(Boolean) as Point[];
    const first = points[0] ?? { lat: 0, lng: 0 };
    const m = new maplibregl.Map({
      container: box.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [first.lng, first.lat],
      zoom: 16,
      attributionControl: { compact: true },
    });
    map.current = m;
    if (planned)
      new maplibregl.Marker({ element: dot('mini-pin plan') })
        .setLngLat([planned.lng, planned.lat])
        .addTo(m);
    if (visit)
      new maplibregl.Marker({ element: dot('mini-pin visit') })
        .setLngLat([visit.lng, visit.lat])
        .addTo(m);
    const here = current ?? first;
    pin.current = new maplibregl.Marker({ element: dot('mini-pin'), draggable: true })
      .setLngLat([here.lng, here.lat])
      .addTo(m);
    pin.current.on('dragend', () => {
      const ll = pin.current!.getLngLat();
      onPinRef.current({ lat: ll.lat, lng: ll.lng });
    });
    m.on('click', (e) => onPinRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
    if (points.length > 1) {
      const lngs = points.map((p) => p.lng);
      const lats = points.map((p) => p.lat);
      m.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 50, maxZoom: 17, duration: 0 },
      );
    }
    return () => m.remove();
    // The plan's pin, the visit and the place now are fixed while the window is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The chosen pin follows the choice.
  useEffect(() => {
    if (chosen && pin.current) {
      pin.current.setLngLat([chosen.lng, chosen.lat]);
      map.current?.easeTo({ center: [chosen.lng, chosen.lat], duration: 300 });
    }
  }, [chosen]);

  return <div className="place-map" ref={box} />;
}
