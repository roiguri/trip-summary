'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { Map as MapType, Marker } from 'maplibre-gl';
import type { Day, Entry, Photo, TransitMode, Trip } from '../lib/data';
const allPhotos = (days: Day[]) => days.flatMap((d) => d.entries.flatMap((e) => e.photos));
function noteDir(s: string): 'ltr' | 'rtl' {
  for (const ch of s) {
    if (/[֐-ࣿ]/.test(ch)) return 'rtl';
    if (/[A-Za-z]/.test(ch)) return 'ltr';
  }
  return 'ltr';
}

/** Note text on the timeline: a place's note under its photos, and the body of a note entry. Both
 *  share one look (user decision) and show the full text, clamped to `lines` lines with "See more"
 *  only when it is actually cut off. Lives inside the entry button, so the toggle is a span with
 *  button semantics and doesn't select the entry. */
function EntryCaption({ text, lines = 2 }: { text: string; lines?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);
  const toggle = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setOpen((o) => !o);
  };
  return (
    <span className="entry-caption" dir={noteDir(text)}>
      <span
        ref={ref}
        className={`entry-caption-text ${open ? 'open' : ''}`}
        style={{ '--lines': lines } as React.CSSProperties}
      >
        {text}
      </span>
      {(clamped || open) && (
        <span
          role="button"
          tabIndex={0}
          className="entry-caption-more"
          aria-expanded={open}
          onClick={toggle}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle(e)}
        >
          {open ? 'See less' : 'See more'}
        </span>
      )}
    </span>
  );
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
/* Transit mode icons: paths from Lucide (https://lucide.dev, ISC licence), one consistent 24px
   line style: car-front, train-front, plane, bus, ship, footprints, bike. */
const TRANSIT_ICONS: Record<TransitMode, string[]> = {
  car: [
    'm21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8',
    'M7 14h.01',
    'M17 14h.01',
    'M5 10h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z',
    'M5 18v2',
    'M19 18v2',
  ],
  train: [
    'M8 3.1V7a4 4 0 0 0 8 0V3.1',
    'm9 15-1-1',
    'm15 15 1-1',
    'M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z',
    'm8 19-2 3',
    'm16 19 2 3',
  ],
  flight: [
    'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
  ],
  bus: [
    'M8 6v6',
    'M15 6v6',
    'M2 12h19.6',
    'M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3',
    'M9 18h5',
    'M5 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
    'M14 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  ],
  ferry: [
    'M12 10.189V14',
    'M12 2v3',
    'M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6',
    'M19.38 20A11.6 11.6 0 0 0 21 14l-8.188-3.639a2 2 0 0 0-1.624 0L3 14a11.6 11.6 0 0 0 2.81 7.76',
    'M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1',
  ],
  walk: [
    'M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z',
    'M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z',
    'M16 17h4',
    'M4 13h4',
  ],
  bike: [
    'M15 17.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0',
    'M2 17.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0',
    'M14 5a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
    'M12 17.5V14l-3-3 4-3 2 3h2',
  ],
};
function TransitIcon({ mode }: { mode: TransitMode }) {
  return (
    <svg className="transit-icon" viewBox="0 0 24 24" aria-hidden="true">
      {TRANSIT_ICONS[mode].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
/** Transit times: one zone label when both ends share it ("09:00 → 09:45 (PT)"), else a label on
 *  each end ("12:30 PT → 15:55 MT"). */
function transitTimes(e: Entry) {
  const dep = zoneLabel(e.departure_timezone);
  const arr = zoneLabel(e.arrival_timezone);
  if (!e.end_time) return `${e.time}${dep ? ` (${dep})` : ''}`;
  if (dep && arr && dep !== arr) return `${e.time} ${dep} → ${e.end_time} ${arr}`;
  return `${e.time} → ${e.end_time}${dep || arr ? ` (${dep || arr})` : ''}`;
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
  // Stays with a location get a house marker (one per stay, from its check-in entry).
  const stays = useMemo(
    () =>
      trip.days.flatMap((d) =>
        d.entries.filter((e) => e.stay?.role === 'checkin' && e.lat != null && e.lng != null),
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
    // OpenStreetMap / OpenFreeMap require visible attribution (the mock shows it as a chip).
    m.addControl(new maplibregl.AttributionControl({ compact: false }), 'bottom-left');
    // The map is created before the right column settles; follow the container's real size so the
    // canvas fills the card and the first fit uses the right dimensions.
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(el.current);
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
      ro.disconnect();
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
    for (const stay of stays) {
      const div = document.createElement('button');
      div.className = `map-stay ${selected?.id === stay.id ? 'chosen-pin' : ''}`;
      div.title = stay.title;
      div.innerHTML =
        '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 7.5 8 3.5l5 4V13H9.5v-3h-3v3H3z"/></svg>';
      div.onclick = () => selectedRef.current(stay);
      markers.current.push(
        new maplibregl.Marker({ element: div, anchor: 'center' })
          .setLngLat([stay.lng!, stay.lat!])
          .addTo(m),
      );
    }
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
  }, [places, stays, day, selected, focused]);
  useEffect(() => {
    map.current?.resize();
  }, [ratio]);
  return <div className="map" ref={el} />;
}
export default function Client({ trip }: { trip: Trip }) {
  // Nothing is selected at first: the map fills the right column until an entry is chosen (user decision).
  const [selected, setSelected] = useState<Entry | null>(null);
  const [day, setDay] = useState(trip.days[0]?.date ?? '');
  const [album, setAlbum] = useState<string | null>(null);
  const [photoPage, setPhotoPage] = useState(0);
  const [full, setFull] = useState<Photo | null>(null);
  const [activePhoto, setActivePhoto] = useState<Photo | null>(null);
  const [ratio, setRatio] = useState('large');
  // The map and the detail card open and close independently (user decision). The detail card is
  // shown while something is selected or a day album is open; closing it clears the selection.
  // With both closed the timeline centres and a round button brings the map back.
  const [mapOpen, setMapOpen] = useState(true);
  const detailsOpen = !!(selected || album);
  const collapsed = !mapOpen && !detailsOpen;
  const [arrows, setArrows] = useState('a');
  const [focus, setFocus] = useState<Photo | null>(null);
  // Multi-day focus: the hovered span, else the selected one; its lane, labels and end marker
  // are emphasised and other lanes fade (only when more than one lane is drawn).
  const [hoverSpan, setHoverSpan] = useState<string | null>(null);
  const focusSpan = hoverSpan ?? (selected?.span_end && !album ? selected.id : null);
  const spanFocus = (id: string) =>
    focusSpan === id ? 'is-focus' : focusSpan && spanLanes.length > 1 ? 'is-dim' : '';
  const hoverProps = (id: string) => ({
    onMouseEnter: () => setHoverSpan(id),
    onMouseLeave: () => setHoverSpan((h) => (h === id ? null : h)),
    onFocus: () => setHoverSpan(id),
    onBlur: () => setHoverSpan((h) => (h === id ? null : h)),
  });
  // Drawn multi-day lanes, measured in rail coordinates: start node centre (x, y0) and end
  // diamond centre (y1, same x on the rail).
  const [spanLanes, setSpanLanes] = useState<
    { id: string; lane: number; x: number; y0: number; y1: number }[]
  >([]);
  const scroller = useRef<HTMLElement>(null);
  const rail = useRef<HTMLElement>(null);
  const days = trip.days;
  const entriesById = useMemo(
    () => new Map(days.flatMap((d) => d.entries).map((e) => [e.id, e])),
    [days],
  );
  // A stay's check-out entry and end-of-day markers open the stay itself (its check-in entry).
  const resolveStay = (e: Entry) =>
    e.stay?.role === 'checkout' ? (entriesById.get(e.stay.stayId) ?? e) : e;
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
      const centre = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2 - rt.left, y: r.top + r.height / 2 - rt.top };
      };
      const lanes = [];
      for (const b of root.querySelectorAll<HTMLElement>('.multiday-end')) {
        const id = b.dataset.spanId;
        const lane = Number(b.dataset.lane);
        const node = root.querySelector(`.multiday-start[data-entry-id="${id}"] .entry-node`);
        const diamond = b.querySelector('.diamond');
        if (!id || lane < 0 || !node || !diamond) continue;
        const start = centre(node);
        lanes.push({ id, lane, x: start.x, y0: start.y, y1: centre(diamond).y });
      }
      setSpanLanes(lanes);
    }
    measure();
    // Re-measure when the timeline's size changes (e.g. photos loading), not only on window resize.
    const resize = new ResizeObserver(measure);
    if (rail.current) resize.observe(rail.current);
    window.addEventListener('resize', measure);
    return () => {
      resize.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  /** `from` is the day a stay was opened from (check-out or end-of-day marker): the timeline
   *  stays where it is and that day stays current, instead of jumping back to the check-in. */
  function choose(e: Entry, from?: string) {
    const root = scroller.current;
    const target = root?.querySelector(`[data-entry-id="${e.id}"]`);
    if (target && root && !from) {
      const top =
        target.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
      root.scrollTo({ top: Math.max(0, top - 60), behavior: 'smooth' });
    }
    setSelected(e);
    setAlbum(null);
    setPhotoPage(0);
    setActivePhoto(null);
    setFocus(null);
    setDay(from ?? e.day);
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
            <LanePath
              key={lane.id}
              {...lane}
              className={`multiday-lane ${laneClass(lane.lane)} ${spanFocus(lane.id)}`}
              onHover={(on) => setHoverSpan((h) => (on ? lane.id : h === lane.id ? null : h))}
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
                  <button
                    className={`multi-day-chip ${laneClass(s.lane)} ${spanFocus(s.id)}`}
                    key={s.id}
                    {...hoverProps(s.id)}
                    onClick={() => {
                      const start = days.flatMap((x) => x.entries).find((e) => e.id === s.id);
                      if (start) choose(start);
                    }}
                    style={
                      {
                        '--outer': Math.max(0, ...d.continuing.map((c) => c.lane)),
                      } as React.CSSProperties
                    }
                  >
                    {s.title} · {s.final ? 'final day' : `day ${s.dayNumber}`}
                  </button>
                ))}
                {timelineItems(d).map((item) =>
                  item.kind === 'end' ? (
                    <div
                      key={`end-${item.id}`}
                      className={`multiday-end ${laneClass(item.lane)} ${spanFocus(item.id)}`}
                      {...hoverProps(item.id)}
                      data-span-id={item.id}
                      data-lane={item.lane}
                      style={{ '--lane': Math.max(0, item.outer) } as React.CSSProperties}
                    >
                      <span className="diamond" />
                      <small>{[item.time, 'END'].filter(Boolean).join(' · ')}</small>
                    </div>
                  ) : (
                    <button
                      key={item.entry.id}
                      data-entry-id={item.entry.id}
                      className={`entry ${item.entry.span_end ? 'multiday-start' : ''} ${selected && selected.id === (item.entry.stay?.stayId ?? item.entry.id) && !album ? 'active' : ''} type-${item.entry.type} ${item.entry.title ? '' : 'no-title'} ${item.index % 2 === 0 ? 'entry-left' : 'entry-right'}`}
                      onClick={() =>
                        item.entry.stay?.role === 'checkout'
                          ? choose(resolveStay(item.entry), item.entry.day)
                          : choose(item.entry)
                      }
                      {...(item.entry.span_end ? hoverProps(item.entry.id) : {})}
                      style={
                        item.entry.outer !== undefined
                          ? ({ '--outer': item.entry.outer } as React.CSSProperties)
                          : undefined
                      }
                    >
                      <span className="entry-node">
                        {item.entry.mode && <TransitIcon mode={item.entry.mode} />}
                      </span>
                      <span
                        className="entry-content"
                        dir={
                          item.entry.type === 'note'
                            ? noteDir(item.entry.notes || item.entry.title)
                            : undefined
                        }
                      >
                        {item.entry.title && <strong>{item.entry.title}</strong>}
                        <small>
                          {item.entry.type === 'cluster' || item.entry.type === 'photo'
                            ? // The card already says "photo"; the byline is just the time (user decision).
                              `${item.entry.time}${item.entry.end_time ? ' – ' + item.entry.end_time : ''}`
                            : item.entry.type === 'lodging'
                              ? `${item.entry.stay?.role === 'checkout' ? 'CHECK-OUT' : 'CHECK-IN'} · ${item.entry.time}`
                              : item.entry.type === 'transit'
                                ? transitTimes(item.entry)
                                : item.entry.type === 'note'
                                  ? `NOTE · ${item.entry.time}`
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
                          <span
                            className="stack"
                            style={
                              {
                                '--n': Math.min(item.entry.photos.length, 3),
                              } as React.CSSProperties
                            }
                          >
                            {item.entry.photos
                              .slice(0, item.entry.type === 'photo' ? 1 : 3)
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
                        {item.entry.notes &&
                          (item.entry.type === 'place' || item.entry.stay?.role === 'checkin') && (
                            <EntryCaption text={item.entry.notes} />
                          )}
                        {item.entry.notes && item.entry.type === 'note' && (
                          <EntryCaption text={item.entry.notes} lines={4} />
                        )}
                      </span>
                    </button>
                  ),
                )}
                {d.nights.map((n) => (
                  <button
                    key={`night-${n.stayId}`}
                    className={`stay-night ${selected?.id === n.stayId && !album ? 'active' : ''}`}
                    onClick={() => {
                      const stay = entriesById.get(n.stayId);
                      if (stay) choose(stay, d.date);
                    }}
                    style={{ '--outer': Math.max(0, n.outer) } as React.CSSProperties}
                  >
                    <span className="stay-night-node" />
                    <small>End of day</small>
                    <strong>{n.title}</strong>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </section>
      </section>
      {collapsed ? (
        <button className="reopen" title="Show map" onClick={() => setMapOpen(true)}>
          ✳
        </button>
      ) : (
        <aside
          className={`right ${mapOpen && !detailsOpen ? 'map-only' : ''} ${!mapOpen ? 'details-only' : ''}`}
        >
          {mapOpen && (
            <section className="map-card">
              <header className="card-head">
                <div>
                  <small>THE JOURNEY / MAP</small>
                  <strong>{trip.destination.name}</strong>
                </div>
                <button className="card-close" title="Close map" onClick={() => setMapOpen(false)}>
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
          )}
          {detailsOpen && (
            <section
              className={`panel ${album ? 'panel-album' : `panel-${selected?.type}`}`}
              key={`${album || selected?.id}-${photoPage}`}
            >
              <button
                className="card-close panel-close"
                title="Close details"
                onClick={() => {
                  setSelected(null);
                  setAlbum(null);
                  setActivePhoto(null);
                  setFocus(null);
                }}
              >
                ×
              </button>
              <div className="panel-body">
                {(album ? days.find((d) => d.date === album)?.title : selected?.title) && (
                  <h2>{album ? days.find((d) => d.date === album)?.title : selected?.title}</h2>
                )}
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
          )}
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
 * A multi-day lane drawn as one dotted path: it leaves the start node's centre diagonally, eases
 * out to its lane `9 * (lane + 1)` px right of the rail, runs down, and eases back in to arrive
 * diagonally at the end diamond's centre (the start curve mirrors the end). Dots are spaced evenly
 * (~12px) along the whole path from the node centre to the diamond centre, so the curves and the
 * straight part share one rhythm and both ends are mirror images; dots that land inside the node
 * or the diamond are hidden behind them.
 * Coordinates are relative to the start node's centre (x right, y down).
 */
const DOT_SPACING = 12;
const CURVE_RISE = 24;
type Point = [number, number];
function lanePath(lane: number, height: number) {
  const dx = 9 * (lane + 1);
  const rise = Math.min(CURVE_RISE + 6 * lane, height / 2);
  const cubic = (a: Point, b: Point, c: Point, d: Point) => (t: number) =>
    [0, 1].map(
      (k) =>
        (1 - t) ** 3 * a[k] +
        3 * (1 - t) ** 2 * t * b[k] +
        3 * (1 - t) * t * t * c[k] +
        t ** 3 * d[k],
    ) as Point;
  const segments = [
    cubic([0, 0], [dx * 0.55, dx * 0.55], [dx, rise * 0.45], [dx, rise]),
    (t: number) => [dx, rise + t * (height - 2 * rise)] as Point,
    cubic(
      [dx, height - rise],
      [dx, height - rise * 0.45],
      [dx * 0.55, height - dx * 0.55],
      [0, height],
    ),
  ];
  const samples: { s: number; p: Point }[] = [{ s: 0, p: [0, 0] }];
  for (const seg of segments)
    for (let k = 1; k <= 200; k++) {
      const p = seg(k / 200);
      const q = samples[samples.length - 1];
      samples.push({ s: q.s + Math.hypot(p[0] - q.p[0], p[1] - q.p[1]), p });
    }
  const length = samples[samples.length - 1].s;
  // Interpolate between samples so dot spacing is exact even on the long straight segment.
  const pointAt = (s: number): Point => {
    const found = samples.findIndex((x) => x.s >= s);
    // Past the last sample (rounding at the very end): use the end point.
    if (found === -1) return samples[samples.length - 1].p;
    const i = Math.max(1, found);
    const a = samples[i - 1];
    const b = samples[i] ?? a;
    const f = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
    return [a.p[0] + (b.p[0] - a.p[0]) * f, a.p[1] + (b.p[1] - a.p[1]) * f];
  };
  // A whole number of gaps from node centre to diamond centre, so the start and end curves carry
  // mirror-image dots; the spacing stays within a fraction of a pixel of 12px.
  const gaps = Math.max(1, Math.round(length / DOT_SPACING));
  const dots: Point[] = [];
  for (let k = 0; k <= gaps; k++) dots.push(pointAt((length * k) / gaps));
  const d =
    `M0,0 C${dx * 0.55},${dx * 0.55} ${dx},${rise * 0.45} ${dx},${rise} ` +
    `L${dx},${height - rise} ` +
    `C${dx},${height - rise * 0.45} ${dx * 0.55},${height - dx * 0.55} 0,${height}`;
  return { dots, d, dx };
}
function LanePath({
  lane,
  x,
  y0,
  y1,
  className,
  onHover,
}: {
  lane: number;
  x: number;
  y0: number;
  y1: number;
  className: string;
  onHover: (on: boolean) => void;
}) {
  const height = Math.max(0, y1 - y0);
  const { dots, d, dx } = useMemo(() => lanePath(lane, height), [lane, height]);
  const pad = 8;
  return (
    <svg
      className={className}
      width={dx + pad * 2}
      height={height + pad * 2}
      style={{ left: x - pad, top: y0 - pad }}
      aria-hidden="true"
    >
      <g transform={`translate(${pad} ${pad})`}>
        {/* A 13px-wide invisible hover band along the path. */}
        <path
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth={13}
          pointerEvents="stroke"
          onMouseEnter={() => onHover(true)}
          onMouseLeave={() => onHover(false)}
        />
        {dots.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={1} />
        ))}
      </g>
    </svg>
  );
}

/** Lane colour class: lane-0..2 for drawn lanes, lane-x for spans shown without a line. */
function laneClass(lane: number) {
  return lane < 0 ? 'lane-x' : `lane-${lane}`;
}
