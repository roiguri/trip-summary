'use client';
import type { Entry, Photo, Trip } from '../../lib/data';
import { MapIcon } from './icons';
import { MapView } from './MapView';

/**
 * The map card. It stays mounted (keeping its view): open, it shows the map; closed, it folds into
 * its header strip while details are open, and narrows into a "Map" pill in the corner when
 * nothing else is (`collapsed`).
 */
export function MapCard({
  trip,
  open,
  collapsed,
  onOpen,
  selected,
  focused,
  day,
  onSelect,
  onWholeTrip,
}: {
  trip: Trip;
  open: boolean;
  collapsed: boolean;
  onOpen: (open: boolean) => void;
  selected: Entry | null;
  focused: Photo | null;
  day: string;
  onSelect: (e: Entry) => void;
  onWholeTrip: () => void;
}) {
  const days = trip.days.length;
  return (
    <section className={`map-card ${open ? '' : collapsed ? 'is-min is-pill' : 'is-min'}`}>
      <button
        className="map-pill"
        title="Show map"
        tabIndex={collapsed ? 0 : -1}
        aria-hidden={!collapsed}
        onClick={() => onOpen(true)}
      >
        <MapIcon /> Map
      </button>
      <div className="map-card-inner">
        <header
          className="card-head"
          onClick={open ? undefined : () => onOpen(true)}
          title={open ? undefined : 'Show map'}
        >
          <div>
            <small>THE JOURNEY / MAP</small>
            <strong>{trip.destination.name}</strong>
          </div>
          <button
            className="card-close"
            title={open ? 'Close map' : 'Show map'}
            onClick={(e) => {
              e.stopPropagation();
              onOpen(!open);
            }}
          >
            {open ? '×' : <MapIcon />}
          </button>
        </header>
        <div className="map-wrap">
          <MapView
            trip={trip}
            selected={selected}
            focused={focused}
            day={day}
            onSelect={onSelect}
          />
          <button className="whole-chip" onClick={onWholeTrip}>
            Whole trip
          </button>
        </div>
        <footer className="map-foot">
          <span>
            ● {days} {days === 1 ? 'DAY' : 'DAYS'} · OSM
          </span>
          <span>OPENFREEMAP</span>
        </footer>
      </div>
    </section>
  );
}
