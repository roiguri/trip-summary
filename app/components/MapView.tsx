'use client';
import { useEffect, useMemo, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapType, Marker } from 'maplibre-gl';
import type { Entry, Photo, Trip } from '../../lib/data';
import { TRANSIT_ICONS } from './icons';

// Served from public/ (scripts/copy-maplibre-worker.mjs): the bundler can't emit the worker itself.
maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

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
/** The zoom from which travel legs are drawn on the map. */
const LEG_MIN_ZOOM = 10;

export function MapView({
  trip,
  selected,
  focused,
  day,
  onSelect,
}: {
  trip: Trip;
  selected: Entry | null;
  focused: Photo | null;
  day: string;
  onSelect: (e: Entry) => void;
}) {
  const el = useRef<HTMLDivElement>(null),
    map = useRef<MapType | null>(null),
    markers = useRef<Marker[]>([]),
    firstDay = useRef(true),
    dayRef = useRef(day),
    // What the map was last fitted to; re-applied when the card changes size (e.g. the detail card
    // opens and the map shrinks), so the same places stay in view.
    fitRef = useRef<{ bounds: Bounds; padding: number; maxZoom: number } | null>(null),
    selectedRef = useRef(onSelect);
  dayRef.current = day;
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
  // Located stops in visit order (places and stay check-ins/outs): the route runs through them.
  const stops = useMemo(
    () =>
      trip.days.flatMap((d) =>
        d.entries.filter(
          (e) => (e.type === 'place' || e.type === 'lodging') && e.lat != null && e.lng != null,
        ),
      ),
    [trip],
  );
  // Transit legs have no coordinates of their own; each is shown halfway between the located stops
  // before and after it (legs missing either neighbour are left off the map).
  const legs = useMemo(() => {
    const all = trip.days.flatMap((d) => d.entries);
    const located = (x: Entry) =>
      (x.type === 'place' || x.type === 'lodging') && x.lat != null && x.lng != null;
    return all.flatMap((e, i) => {
      if (e.type !== 'transit' || !e.mode) return [];
      const prev = all.slice(0, i).reverse().find(located);
      const next = all.slice(i + 1).find(located);
      if (!prev || !next) return [];
      return [{ entry: e, lng: (prev.lng! + next.lng!) / 2, lat: (prev.lat! + next.lat!) / 2 }];
    });
  }, [trip]);
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
    const ro = new ResizeObserver(() => {
      m.resize();
      const f = fitRef.current;
      if (f) m.fitBounds(f.bounds, { padding: f.padding, maxZoom: f.maxZoom, duration: 0 });
    });
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
      if (!m.getSource('route')) {
        // One dotted line per day, starting from where the previous day ended (as in the mock); all
        // days faint, the current day (or every day in the whole-trip view) stronger.
        const byDay = new Map<string, number[][]>();
        let last: number[] | null = null;
        for (const e of stops) {
          const pt = [e.lng!, e.lat!];
          if (!byDay.has(e.day)) byDay.set(e.day, last ? [last] : []);
          byDay.get(e.day)!.push(pt);
          last = pt;
        }
        m.addSource('route', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [...byDay]
              .filter(([, coordinates]) => coordinates.length > 1)
              .map(([d, coordinates]) => ({
                type: 'Feature',
                geometry: { type: 'LineString', coordinates },
                properties: { day: d },
              })),
          },
        });
        const dots = {
          'line-color': '#6c9e83',
          'line-width': 3,
          'line-dasharray': [0, 2],
        };
        m.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { ...dots, 'line-opacity': 0.3 },
        });
        m.addLayer({
          id: 'route-day',
          type: 'line',
          source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { ...dots, 'line-opacity': 0.9 },
          filter: dayRef.current ? ['==', ['get', 'day'], dayRef.current] : ['has', 'day'],
        });
      }
      // Keep a view already chosen before the style finished loading (e.g. a quick first click).
      const whole = boundsOf(places);
      if (!fitRef.current && whole) fitRef.current = { bounds: whole, padding: 55, maxZoom: 11 };
      const f = fitRef.current;
      if (f) m.fitBounds(f.bounds, { padding: f.padding, maxZoom: f.maxZoom, duration: 0 });
    });
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, [places, stops]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (m.getLayer('route-day')) m.setFilter('route-day', day ? ['==', ['get', 'day'], day] : null);
    const onDay = (e: Entry) => !day || e.day === day;
    type Item = { entry: Entry; kind: 'place' | 'stay'; label: string };
    const items: Item[] = [
      ...places.map((entry, i) => ({ entry, kind: 'place' as const, label: String(i + 1) })),
      ...stays.map((entry) => ({ entry, kind: 'stay' as const, label: '' })),
    ];
    const pinFor = ({ entry, kind, label }: Item) => {
      const div = document.createElement('button');
      div.title = entry.title;
      div.onclick = () => selectedRef.current(entry);
      if (kind === 'place') {
        div.className = `map-pin ${onDay(entry) ? 'day-pin' : 'dim-pin'} ${selected?.id === entry.id ? 'chosen-pin' : ''}`;
        div.textContent = label;
      } else {
        div.className = `map-stay ${onDay(entry) ? '' : 'dim-pin'} ${selected?.id === entry.id ? 'chosen-pin' : ''}`;
        div.innerHTML =
          '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 7.5 8 3.5l5 4V13H9.5v-3h-3v3H3z"/></svg>';
      }
      return div;
    };
    // Pins that would touch on screen are merged into one bubble with their count (user decision);
    // clicking it zooms in until they separate. The selected pin is never merged. Re-run on zoom.
    const render = () => {
      markers.current.forEach((x) => x.remove());
      // Start with one group per pin and merge any two groups that would touch on screen (a pill is
      // wider than a pin), repeating until none do. The selected pin always stays on its own.
      type Group = { members: Item[]; x: number; y: number };
      const groups: Group[] = items.map((it) => {
        const pt = m.project([it.entry.lng!, it.entry.lat!]);
        return { members: [it], x: pt.x, y: pt.y };
      });
      const solo = (g: Group) => g.members.some((x) => x.entry.id === selected?.id);
      for (let merged = true; merged;) {
        merged = false;
        for (let i = 0; i < groups.length && !merged; i++)
          for (let j = i + 1; j < groups.length && !merged; j++) {
            const [a, b] = [groups[i], groups[j]];
            if (solo(a) || solo(b)) continue;
            const wide = a.members.length > 1 || b.members.length > 1;
            if (Math.abs(a.x - b.x) < (wide ? 62 : 26) && Math.abs(a.y - b.y) < 26) {
              const n = a.members.length + b.members.length;
              a.x = (a.x * a.members.length + b.x * b.members.length) / n;
              a.y = (a.y * a.members.length + b.y * b.members.length) / n;
              a.members.push(...b.members);
              groups.splice(j, 1);
              merged = true;
            }
          }
      }
      // A pill that would sit under the selected pin moves just above or below it.
      const chosen = groups.find(solo);
      for (const g of groups)
        if (chosen && g !== chosen && g.members.length > 1)
          if (Math.abs(g.x - chosen.x) < 44 && Math.abs(g.y - chosen.y) < 26)
            g.y = chosen.y + (g.y <= chosen.y ? -28 : 28);
      const out: Marker[] = [];
      groups.forEach(({ members: group, x, y }) => {
        const a = { it: group[0] };
        let div: HTMLElement;
        let at: [number, number];
        if (group.length === 1) {
          div = pinFor(a.it);
          at = [a.it.entry.lng!, a.it.entry.lat!];
        } else {
          const members = group.map((g) => g.entry);
          div = document.createElement('button');
          div.className = `map-cluster ${members.some(onDay) ? 'day-pin' : 'dim-pin'}`;
          div.textContent = `${group.length} stops`;
          div.title = members.map((e) => e.title).join(' · ');
          const bounds = boundsOf(members)!;
          div.onclick = () => m.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: 650 });
          const ll = m.unproject([x, y]);
          at = [ll.lng, ll.lat];
        }
        out.push(new maplibregl.Marker({ element: div, anchor: 'center' }).setLngLat(at).addTo(m));
      });
      // Stack order: other days below the current day's markers, the selected one on top.
      const layer = (div: HTMLElement) =>
        (div.style.zIndex = div.classList.contains('chosen-pin')
          ? '3'
          : div.classList.contains('dim-pin')
            ? '1'
            : '2');
      // Travel legs only from about city level in (user decision, Oct 3): zoomed out over a whole
      // trip they would crowd the map. The selected leg always shows.
      for (const leg of legs) {
        if (m.getZoom() < LEG_MIN_ZOOM && selected?.id !== leg.entry.id) continue;
        const div = document.createElement('button');
        div.className = `map-leg ${onDay(leg.entry) ? '' : 'dim-pin'} ${selected?.id === leg.entry.id ? 'chosen-pin' : ''}`;
        div.title = leg.entry.title;
        div.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${TRANSIT_ICONS[leg.entry.mode!].map((d) => `<path d="${d}"/>`).join('')}</svg>`;
        div.onclick = () => selectedRef.current(leg.entry);
        out.push(
          new maplibregl.Marker({ element: div, anchor: 'center' })
            .setLngLat([leg.lng, leg.lat])
            .addTo(m),
        );
      }
      const p = focused || (selected?.type !== 'place' ? selected?.photos[0] : null);
      if (p?.lat != null && p?.lng != null) {
        const div = document.createElement('div');
        div.className = 'photo-pin';
        div.textContent = '✦';
        out.push(
          new maplibregl.Marker({ element: div, anchor: 'center' })
            .setLngLat([p.lng, p.lat])
            .addTo(m),
        );
      }
      out.forEach((x) => layer(x.getElement()));
      markers.current = out;
    };
    render();
    m.on('zoomend', render);
    if (!day && !firstDay.current) {
      const whole = boundsOf(places);
      if (whole) {
        fitRef.current = { bounds: whole, padding: 55, maxZoom: 11 };
        m.fitBounds(whole, { padding: 55, maxZoom: 11, duration: 650 });
      }
    } else if (day && !firstDay.current) {
      const ds = boundsOf(places.filter((e) => e.day === day));
      if (ds) {
        fitRef.current = { bounds: ds, padding: 65, maxZoom: 14 };
        m.fitBounds(ds, { padding: 65, maxZoom: 14, duration: 650 });
      }
    }
    firstDay.current = false;
    return () => {
      m.off('zoomend', render);
    };
  }, [places, stays, legs, day, selected, focused]);
  return <div className="map" ref={el} />;
}
