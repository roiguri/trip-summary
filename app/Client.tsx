'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { Map as MapType, Marker } from 'maplibre-gl';
import type { Day, Entry, Photo, Trip } from '../lib/data';
const allPhotos = (days: Day[]) => days.flatMap((d) => d.entries.flatMap((e) => e.photos));
function noteDir(s: string): 'ltr' | 'rtl' {
  for (const ch of s) {
    if (/[֐-ࣿ]/.test(ch)) return 'rtl';
    if (/[A-Za-z]/.test(ch)) return 'ltr';
  }
  return 'ltr';
}
function zoneLabel(zone: string | null) {
  if (!zone) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'shortGeneric',
    }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value || zone;
  } catch {
    return zone.split('/').pop()?.replace(/_/g, ' ') || zone;
  }
}
type Bounds = [[number, number], [number, number]];
function boundsOf(points: { lat: number | null; lng: number | null }[]): Bounds | null {
  const pts = points.filter((p) => p.lat != null && p.lng != null);
  if (!pts.length) return null;
  const lngs = pts.map((p) => p.lng!),
    lats = pts.map((p) => p.lat!);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}
function icon(type: Entry['type'], title: string) {
  if (type === 'transit')
    return /train/i.test(title) ? 'train' : /flight|fly/i.test(title) ? 'flight' : 'drive';
  if (type === 'lodging') return '⌂';
  if (type === 'note') return '✎';
  if (type === 'cluster') return '▦';
  return '◈';
}
function MapView({
  trip,
  selected,
  focused,
  day,
  onSelect,
  ratio,
}: {
  trip: Trip;
  selected: Entry | null;
  focused: Photo | null;
  day: string;
  onSelect: (e: Entry) => void;
  ratio: string;
}) {
  const el = useRef<HTMLDivElement>(null),
    map = useRef<MapType | null>(null),
    markers = useRef<Marker[]>([]),
    firstDay = useRef(true),
    selectedRef = useRef(onSelect);
  selectedRef.current = onSelect;
  const places = useMemo(
    () =>
      trip.days.flatMap((d) =>
        d.entries.filter((e) => e.type === 'place' && e.lat != null && e.lng != null),
      ),
    [trip],
  );
  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [
        trip.destination.lng ?? places[0]?.lng ?? 0,
        trip.destination.lat ?? places[0]?.lat ?? 0,
      ],
      zoom: 9,
      attributionControl: false,
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.once('load', () => {
      const colors: Record<string, string> = {
        background: '#f8f7f1',
        park: '#e2eddf',
        park_outline: '#d6e5d4',
        landuse_residential: '#f3f2e9',
        landcover_wood: '#e0eddf',
        landcover_grass: '#e3ede0',
        landcover_ice: '#e6eee8',
        landcover_wetland: '#e5efe7',
        landuse_pitch: '#e7ebe0',
        landuse_track: '#e7ebe0',
        landuse_cemetery: '#e5eddf',
        landuse_hospital: '#f3f0e8',
        landuse_school: '#e7eadf',
        waterway_tunnel: '#b9d8d4',
        waterway_river: '#b9d8d4',
        waterway_other: '#b9d8d4',
        water: '#d7e9e5',
        landcover_sand: '#f3eee3',
        aeroway_fill: '#efeee7',
        aeroway_runway: '#e4e0d7',
        aeroway_taxiway: '#e4e0d7',
        tunnel_motorway_link_casing: '#e2dcd1',
        tunnel_service_track_casing: '#e2dcd1',
        tunnel_link_casing: '#e2dcd1',
        tunnel_street_casing: '#e2dcd1',
      };
      for (const [id, color] of Object.entries(colors)) {
        const layer = m.getLayer(id);
        if (!layer) continue;
        try {
          if (layer.type === 'background') m.setPaintProperty(id, 'background-color', color);
          else if (layer.type === 'fill') {
            m.setPaintProperty(id, 'fill-color', color);
            if (id === 'water') m.setPaintProperty(id, 'fill-opacity', 1);
          } else if (layer.type === 'line') m.setPaintProperty(id, 'line-color', color);
        } catch {}
      }
      if (!m.getLayer('route')) {
        m.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: places.map((e) => [e.lng!, e.lat!]) },
            properties: {},
          },
        });
        m.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          paint: {
            'line-color': '#6c9e83',
            'line-width': 2,
            'line-dasharray': [1.5, 3],
            'line-opacity': 0.72,
          },
        });
      }
      const whole = boundsOf(places);
      if (whole) m.fitBounds(whole, { padding: 55, maxZoom: 11, duration: 0 });
    });
    return () => {
      m.remove();
      map.current = null;
    };
  }, [places]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach((x) => x.remove());
    markers.current = places.map((entry, i) => {
      const div = document.createElement('button');
      div.className = `map-pin ${entry.day === day ? 'day-pin' : 'dim-pin'} ${selected?.id === entry.id ? 'chosen-pin' : ''}`;
      div.textContent = String(i + 1);
      div.title = entry.title;
      div.onclick = () => selectedRef.current(entry);
      return new maplibregl.Marker({ element: div, anchor: 'center' })
        .setLngLat([entry.lng!, entry.lat!])
        .addTo(m);
    });
    let p = focused || (selected?.type !== 'place' ? selected?.photos[0] : null);
    if (p?.lat != null && p?.lng != null) {
      const div = document.createElement('div');
      div.className = 'photo-pin';
      div.textContent = '✦';
      markers.current.push(
        new maplibregl.Marker({ element: div, anchor: 'center' })
          .setLngLat([p.lng, p.lat])
          .addTo(m),
      );
    }
    if (!day && !firstDay.current) {
      const whole = boundsOf(places);
      if (whole) m.fitBounds(whole, { padding: 55, maxZoom: 11, duration: 650 });
    } else if (day && !firstDay.current) {
      const ds = places.filter((e) => e.day === day);
      if (ds.length)
        m.fitBounds(
          ds.reduce(
            (bounds, e) => bounds.extend([e.lng!, e.lat!]),
            new maplibregl.LngLatBounds([ds[0].lng!, ds[0].lat!], [ds[0].lng!, ds[0].lat!]),
          ),
          { padding: 65, maxZoom: 11, duration: 650 },
        );
    }
    firstDay.current = false;
  }, [places, day, selected, focused]);
  useEffect(() => {
    map.current?.resize();
  }, [ratio]);
  return <div className="map" ref={el} />;
}
export default function Client({ trip }: { trip: Trip }) {
  const [selected, setSelected] = useState<Entry | null>(
    trip.days.flatMap((d) => d.entries)[0] ?? null,
  );
  const [day, setDay] = useState(trip.days[0]?.date ?? '');
  const [album, setAlbum] = useState<string | null>(null);
  const [photoPage, setPhotoPage] = useState(0);
  const [full, setFull] = useState<Photo | null>(null);
  const [activePhoto, setActivePhoto] = useState<Photo | null>(null);
  const [ratio, setRatio] = useState('large');
  const [collapsed, setCollapsed] = useState(false);
  const [arrows, setArrows] = useState('a');
  const [focus, setFocus] = useState<Photo | null>(null);
  const [spanLanes, setSpanLanes] = useState<
    { id: string; top: number; height: number; lane: number }[]
  >([]);
  const scroller = useRef<HTMLElement>(null);
  const rail = useRef<HTMLElement>(null);
  const days = trip.days;
  const photos = album
    ? allPhotos(days).filter((p) =>
        days
          .find((d) => d.date === album)
          ?.entries.some((e) => e.photos.some((x) => x.id === p.id)),
      )
    : selected?.photos || [];
  const pagePhotos = photos.slice(photoPage * 12, photoPage * 12 + 12);
  const fullscreenSet = photos;
  const index = full ? fullscreenSet.findIndex((p) => p.id === full.id) : -1;
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const r = q.get('map');
    if (['small', 'current', 'large'].includes(r || '')) setRatio(r!);
    const a = q.get('arrows');
    if (['a', 'b', 'c'].includes(a || '')) setArrows(a!);
  }, []);
  useEffect(() => {
    function key(ev: KeyboardEvent) {
      if (ev.key === 'Escape') setFull(null);
      if (full && ev.key === 'ArrowRight')
        setFull(fullscreenSet[(index + 1) % fullscreenSet.length]);
      if (full && ev.key === 'ArrowLeft')
        setFull(fullscreenSet[(index - 1 + fullscreenSet.length) % fullscreenSet.length]);
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [full, index, fullscreenSet]);
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (records) => {
        for (const r of records)
          if (r.isIntersecting) {
            const id = (r.target as HTMLElement).dataset.day;
            if (id) setDay(id);
          }
      },
      { root, rootMargin: '-15% 0px -65% 0px' },
    );
    root.querySelectorAll('[data-day]').forEach((e) => observer.observe(e));
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    function measure() {
      const root = rail.current;
      if (!root) return;
      const rt = root.getBoundingClientRect();
      const lanes = [];
      for (const b of root.querySelectorAll<HTMLElement>('.multiday-end')) {
        const id = b.dataset.spanId;
        const a = root.querySelector(`.multiday-start[data-entry-id="${id}"] .entry-node`);
        if (!id || !a) continue;
        const top = a.getBoundingClientRect().top - rt.top + 20;
        const end = b.getBoundingClientRect().top - rt.top + 9;
        const lane = Number(b.dataset.lane);
        if (lane < 0) continue;
        lanes.push({ id, top, height: Math.max(0, end - top), lane });
      }
      setSpanLanes(lanes);
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  function choose(e: Entry) {
    const root = scroller.current;
    const target = root?.querySelector(`[data-entry-id="${e.id}"]`);
    if (target && root) {
      const top =
        target.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
      root.scrollTo({ top: Math.max(0, top - 60), behavior: 'smooth' });
    }
    setSelected(e);
    setAlbum(null);
    setPhotoPage(0);
    setActivePhoto(null);
    setFocus(null);
    setDay(e.day);
  }
  function showAlbum(d: string) {
    setDay(d);
    setAlbum(d);
    setSelected(null);
    setPhotoPage(0);
    setActivePhoto(null);
    setFocus(null);
  }
  function pickPhoto(p: Photo) {
    setActivePhoto(p);
    setFocus(p);
    setFull(p);
  }
  return (
    <main
      className={`shell ${collapsed ? 'collapsed' : ''}`}
      style={
        {
          '--map-height': ratio === 'small' ? '20%' : ratio === 'large' ? '40%' : '30%',
        } as React.CSSProperties
      }
    >
      <header className="header">
        <div className="brand">
          <span className="brand-mark">✳</span> WAYFARER
        </div>
        <nav className="nav">
          <span className="nav-active">THE JOURNEY</span>
          <span>WISHLIST</span>
          <span>PLACES</span>
        </nav>
        <span className="status">View-only demo · sign-in not configured</span>
      </header>
      <section className="left" ref={scroller}>
        <div className="intro">
          <div className="kicker">03 / THE JOURNEY</div>
          <h1>{trip.title}</h1>
          <p>{[trip.subtitle, trip.timezone].filter(Boolean).join(' · ')}</p>
        </div>
        <section className="rail" ref={rail}>
          {spanLanes.map((lane) => (
            <div
              key={lane.id}
              className={`multiday-span ${laneClass(lane.lane)}`}
              style={
                {
                  top: lane.top,
                  height: lane.height,
                  paddingBottom: laneCurve(lane.lane).padBottom,
                  '--lane': lane.lane,
                } as React.CSSProperties
              }
            />
          ))}
          {days.map((d, di) => (
            <section className="day-section" data-day={d.date} key={d.date}>
              <button
                className={`day-banner ${album === d.date ? 'active' : ''}`}
                onClick={() => showAlbum(d.date)}
              >
                <span>
                  Day {di + 1} -{' '}
                  {new Date(`${d.date}T12:00:00`).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
                {d.tags.length > 0 && <small>{d.tags.join(' · ')}</small>}
              </button>
              <div className="entries">
                {d.continuing.map((s) => (
                  <div
                    className={`multi-day-chip ${laneClass(s.lane)}`}
                    key={s.id}
                    style={
                      {
                        '--outer': Math.max(0, ...d.continuing.map((c) => c.lane)),
                      } as React.CSSProperties
                    }
                  >
                    {s.title} · {s.final ? 'final day' : `day ${s.dayNumber}`}
                  </div>
                ))}
                {timelineItems(d).map((item) =>
                  item.kind === 'end' ? (
                    <div
                      className={`multiday-end ${laneClass(item.lane)}`}
                      data-span-id={item.id}
                      data-lane={item.lane}
                      key={`end-${item.id}`}
                      style={{ '--lane': Math.max(0, item.outer) } as React.CSSProperties}
                    >
                      {item.lane >= 0 && <LaneCurve lane={item.lane} />}
                      <span className="diamond" />
                      <small>{[item.time, 'END'].filter(Boolean).join(' · ')}</small>
                    </div>
                  ) : (
                    <button
                      key={item.entry.id}
                      data-entry-id={item.entry.id}
                      className={`entry ${item.entry.span_end ? 'multiday-start' : ''} ${selected?.id === item.entry.id && !album ? 'active' : ''} type-${item.entry.type} ${item.index % 2 === 0 ? 'entry-left' : 'entry-right'}`}
                      onClick={() => choose(item.entry)}
                    >
                      <span className="entry-node">
                        {item.entry.type === 'transit' && (
                          <svg className="transit-icon" viewBox="0 0 24 24" aria-hidden="true">
                            {icon(item.entry.type, item.entry.title) === 'train' ? (
                              <>
                                <rect x="5" y="2" width="14" height="17" rx="3" />
                                <path d="M5 9h14M7 15h2m6 0h2M8 19l-2 3m10-3 2 3" />
                              </>
                            ) : icon(item.entry.type, item.entry.title) === 'flight' ? (
                              <path d="M2 13l8 2 3 7 2-1-1-7 7-8a2 2 0 0 0-3-3l-8 7-7-1z" />
                            ) : (
                              <>
                                <path d="M4 15l2-7h12l2 7v5h-3v-2H7v2H4zM6 15h12M8 18v-3m8 3v-3" />
                              </>
                            )}
                          </svg>
                        )}
                      </span>
                      <span
                        className="entry-content"
                        dir={
                          item.entry.type === 'note'
                            ? noteDir(item.entry.notes || item.entry.title)
                            : undefined
                        }
                      >
                        <strong>{item.entry.title}</strong>
                        <small>
                          {item.entry.type === 'cluster'
                            ? `PHOTO · ${item.entry.time} – ${item.entry.end_time}`
                            : item.entry.type === 'photo'
                              ? `PHOTO · ${item.entry.time}`
                              : item.entry.type === 'lodging'
                                ? 'STAY · ' + item.entry.time
                                : item.entry.type === 'transit'
                                  ? `${item.entry.time}${item.entry.end_time ? ' → ' + item.entry.end_time : ''}${item.entry.departure_timezone ? ' (' + zoneLabel(item.entry.departure_timezone) + ')' : ''}`
                                  : item.entry.type === 'note'
                                    ? item.entry.time
                                    : (
                                        (item.entry.tags[0] || 'PLACE') +
                                        ' · ' +
                                        item.entry.time
                                      ).toUpperCase()}
                        </small>
                        {item.entry.type === 'transit' && (
                          <span className="transit-route">
                            {item.entry.from_location || 'Origin'} →{' '}
                            {item.entry.to_location || 'Destination'}
                          </span>
                        )}
                        {item.entry.photos.length > 0 && (
                          <span className="stack">
                            {item.entry.photos
                              .slice(
                                0,
                                item.entry.type === 'photo' || item.entry.type === 'cluster'
                                  ? 1
                                  : 3,
                              )
                              .map((p, i) => (
                                <img
                                  key={p.id}
                                  src={p.url}
                                  alt=""
                                  style={{ '--i': i } as React.CSSProperties}
                                />
                              ))}
                          </span>
                        )}
                        {item.entry.notes && item.entry.type === 'note' && (
                          <span className="entry-note" dir={noteDir(item.entry.notes)}>
                            {item.entry.notes}
                          </span>
                        )}
                      </span>
                    </button>
                  ),
                )}
              </div>
            </section>
          ))}
        </section>
      </section>
      {collapsed ? (
        <button className="reopen" title="Show map and details" onClick={() => setCollapsed(false)}>
          ✳
        </button>
      ) : (
        <aside className="right">
          <section className="map-card">
            <header className="card-head">
              <div>
                <small>THE JOURNEY / MAP</small>
                <strong>{trip.destination.name}</strong>
              </div>
              <button
                className="card-close"
                title="Collapse map and details"
                onClick={() => setCollapsed(true)}
              >
                ×
              </button>
            </header>
            <div className="map-wrap">
              <MapView
                trip={trip}
                selected={selected}
                focused={focus}
                day={day}
                onSelect={choose}
                ratio={ratio}
              />
              <button className="whole-chip" onClick={() => setDay('')}>
                Whole trip
              </button>
            </div>
            <footer className="map-foot">
              <span>
                ● {days.length} {days.length === 1 ? 'DAY' : 'DAYS'} · OSM
              </span>
              <span>OPENFREEMAP</span>
            </footer>
          </section>
          <section
            className={`panel ${album ? 'panel-album' : `panel-${selected?.type}`}`}
            key={`${album || selected?.id}-${photoPage}`}
          >
            <div className="panel-body">
              <h2>{album ? days.find((d) => d.date === album)?.title : selected?.title}</h2>
              {!album && selected && (
                <div className="meta">
                  {selected.type === 'cluster' ? (
                    ''
                  ) : (
                    <>
                      {selected.day} <span>·</span>{' '}
                    </>
                  )}
                  {selected.time}
                  {selected.end_time ? ` – ${selected.end_time}` : ''}{' '}
                  {selected.tags.map((t) => (
                    <em key={t}>{t}</em>
                  ))}
                </div>
              )}
              {selected?.type === 'lodging' && !album && (
                <div className="stay-info">
                  <span>
                    CHECK-IN
                    <br />
                    <b>
                      {selected.day} · {selected.time}
                    </b>
                  </span>
                  <span>
                    CHECK-OUT
                    <br />
                    <b>{selected.check_out}</b>
                  </span>
                </div>
              )}
              {photos.length > 0 && (
                <>
                  <div
                    className={`photos count-${Math.min(pagePhotos.length, 12)} arrows-${arrows}`}
                  >
                    {pagePhotos.map((p) => (
                      <button
                        className={`photo ${activePhoto?.id === p.id ? 'photo-active' : ''}`}
                        key={p.id}
                        onClick={() => pickPhoto(p)}
                      >
                        <img src={p.url} alt={p.caption} />
                        <span>{p.caption}</span>
                      </button>
                    ))}
                  </div>
                  <div className={`pagination pagination-${arrows}`}>
                    <small>
                      {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
                    </small>
                    <div>
                      <button
                        aria-label="Previous photos"
                        disabled={photoPage === 0}
                        onClick={() => setPhotoPage((v) => v - 1)}
                      >
                        {arrows === 'a' ? (
                          <svg
                            className="pager-chevron prev-chevron"
                            viewBox="0 0 16 16"
                            aria-hidden="true"
                          >
                            <path d="M6 5 L9 8 L6 11" />
                          </svg>
                        ) : arrows === 'c' ? (
                          '←'
                        ) : (
                          '‹'
                        )}
                      </button>
                      <span>
                        {arrows === 'b'
                          ? `${String(photoPage + 1).padStart(2, '0')} / ${String(Math.ceil(photos.length / 12)).padStart(2, '0')}`
                          : `${photoPage + 1} / ${Math.ceil(photos.length / 12)}`}
                      </span>
                      <button
                        aria-label="Next photos"
                        disabled={(photoPage + 1) * 12 >= photos.length}
                        onClick={() => setPhotoPage((v) => v + 1)}
                      >
                        {arrows === 'a' ? (
                          <svg className="pager-chevron" viewBox="0 0 16 16" aria-hidden="true">
                            <path d="M6 5 L9 8 L6 11" />
                          </svg>
                        ) : arrows === 'c' ? (
                          '→'
                        ) : (
                          '›'
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}
              {!album && selected?.notes && <p className="note">{selected.notes}</p>}
              {!album && selected?.type === 'place' && selected.lat != null && (
                <a
                  className="maps-link"
                  target="_blank"
                  rel="noreferrer"
                  href={
                    selected.maps_url ||
                    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${selected.lat},${selected.lng}`)}`
                  }
                >
                  View on Google Maps ↗
                </a>
              )}
            </div>
          </section>
        </aside>
      )}
      {full && (
        <div className="lightbox" onClick={() => setFull(null)}>
          <button className="close" onClick={() => setFull(null)}>
            ✕ CLOSE
          </button>
          <button
            className="lightnav prev"
            onClick={(e) => {
              e.stopPropagation();
              setFull(fullscreenSet[(index - 1 + fullscreenSet.length) % fullscreenSet.length]);
            }}
          >
            ←
          </button>
          <img src={full.url} alt={full.caption} onClick={(e) => e.stopPropagation()} />
          <button
            className="lightnav next"
            onClick={(e) => {
              e.stopPropagation();
              setFull(fullscreenSet[(index + 1) % fullscreenSet.length]);
            }}
          >
            →
          </button>
          <div className="lightcaption">
            {full.caption}{' '}
            <span>
              {index + 1} / {fullscreenSet.length}
            </span>
          </div>
        </div>
      )}
    </main>
  );
}

type TimelineItem =
  | { kind: 'entry'; entry: Entry; index: number }
  | { kind: 'end'; id: string; time: string | null; lane: number; outer: number };
/** A day's entries plus the end markers of multi-day spans, in time order; `index` drives left/right alternation. */
function timelineItems(d: Day): TimelineItem[] {
  const items: TimelineItem[] = d.entries.map((entry, index) => ({ kind: 'entry', entry, index }));
  const timeOf = (x: TimelineItem) => (x.kind === 'entry' ? x.entry.time : x.time);
  const ends = [...d.spanEnds].sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'));
  for (const end of ends) {
    const at = items.findIndex((x) => !!end.time && (timeOf(x) ?? '') > end.time);
    items.splice(at === -1 ? items.length : at, 0, { kind: 'end', ...end });
  }
  return items;
}

/**
 * End curve of a multi-day lane. The lane runs `9 * (lane + 1)` px right of the rail and eases into
 * the rail through a smooth curve that ends at the diamond's centre (hidden behind the diamond).
 * Dots keep the lane's 12px spacing along the curve, counted back from the centre, so the straight
 * part of the lane must end where that rhythm continues: `padBottom` places its last dot there.
 * Coordinates are relative to the diamond centre (x right, y down).
 */
const DOT_SPACING = 12;
const CURVE_RISE = 24;
const laneCurves = new Map<number, { dots: [number, number][]; rise: number; padBottom: number }>();
function laneCurve(lane: number) {
  const cached = laneCurves.get(lane);
  if (cached) return cached;
  const dx = 9 * (lane + 1);
  // Leaves the lane vertically `rise` px above the diamond and arrives diagonally (45°) at the
  // diamond's centre, so the last visible dots point at the middle of the diamond.
  const rise = CURVE_RISE + 6 * lane;
  const P = [
    [dx, -rise],
    [dx, -rise * 0.45],
    [dx * 0.55, -dx * 0.55],
    [0, 0],
  ];
  const at = (t: number) =>
    [0, 1].map(
      (k) =>
        (1 - t) ** 3 * P[0][k] +
        3 * (1 - t) ** 2 * t * P[1][k] +
        3 * (1 - t) * t * t * P[2][k] +
        t ** 3 * P[3][k],
    ) as [number, number];
  const samples: { s: number; p: [number, number] }[] = [{ s: 0, p: at(0) }];
  for (let k = 1; k <= 200; k++) {
    const p = at(k / 200);
    const q = samples[samples.length - 1];
    samples.push({ s: q.s + Math.hypot(p[0] - q.p[0], p[1] - q.p[1]), p });
  }
  const length = samples[samples.length - 1].s;
  const dots: [number, number][] = [];
  let s = length;
  for (; s >= -1e-6; s -= DOT_SPACING)
    dots.push((samples.find((x) => x.s >= s - 1e-6) ?? samples[samples.length - 1]).p);
  const firstOnCurve = s + DOT_SPACING;
  const lastStraightY = -rise - (DOT_SPACING - firstOnCurve);
  // The span ends 1px below the diamond centre and its dots sit 9px above its content bottom.
  const result = { dots, rise, padBottom: -8 - lastStraightY };
  laneCurves.set(lane, result);
  return result;
}
function LaneCurve({ lane }: { lane: number }) {
  const { dots, rise } = laneCurve(lane);
  const pad = 3;
  const width = 9 * (lane + 1) + pad * 2;
  return (
    <svg
      className="lane-curve"
      width={width}
      height={rise + pad * 2}
      style={{ left: -2 - pad, top: 8 - rise - pad }}
      aria-hidden="true"
    >
      {dots.map(([x, y], i) => (
        <circle key={i} cx={x + pad} cy={y + rise + pad} r={1} />
      ))}
    </svg>
  );
}

/** Lane colour class: lane-0..2 for drawn lanes, lane-x for spans shown without a line. */
function laneClass(lane: number) {
  return lane < 0 ? 'lane-x' : `lane-${lane}`;
}
