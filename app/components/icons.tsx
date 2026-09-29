import type { TransitMode } from '../../lib/data';

/* Transit mode icons: paths from Lucide (https://lucide.dev, ISC licence), one consistent 24px
   line style: car-front, train-front, plane, bus, ship, footprints, bike. */
export const TRANSIT_ICONS: Record<TransitMode, string[]> = {
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
/** Lucide "map" (ISC licence), for reopening the map. */
export function MapIcon() {
  return (
    <svg className="map-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" />
      <path d="M15 5.764v15" />
      <path d="M9 3.236v15" />
    </svg>
  );
}
export function TransitIcon({ mode }: { mode: TransitMode }) {
  return (
    <svg className="transit-icon" viewBox="0 0 24 24" aria-hidden="true">
      {TRANSIT_ICONS[mode].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
/** The thin chevron used by the photo pager (points right; `back` mirrors it). */
export function PagerChevron({ back = false }: { back?: boolean }) {
  return (
    <svg
      className={`pager-chevron ${back ? 'prev-chevron' : ''}`}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path d="M6 5 L9 8 L6 11" />
    </svg>
  );
}
