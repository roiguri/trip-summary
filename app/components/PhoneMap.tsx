'use client';
import { useEffect, useRef } from 'react';
import type { Entry, Photo, Trip } from '../../lib/data';
import { KICKERS, formatDay } from '../lib/format';
import { MapView } from './MapView';

const pillDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });

/**
 * The map on a phone (user decision, option 2A): full screen, opened from the floating Map button.
 * A top bar returns to the timeline and shows the day; every day is a pill in one row that scrolls
 * sideways; tapping a pin shows its card, whose "Details" opens the details sheet over the map.
 */
export function PhoneMap({
  trip,
  day,
  onDay,
  selected,
  focused,
  peek,
  onPeek,
  onDetails,
  onClose,
}: {
  trip: Trip;
  day: string;
  onDay: (date: string) => void;
  selected: Entry | null;
  focused: Photo | null;
  peek: Entry | null;
  onPeek: (e: Entry) => void;
  onDetails: (e: Entry) => void;
  onClose: () => void;
}) {
  const pills = useRef<HTMLDivElement>(null);
  const dayIndex = trip.days.findIndex((d) => d.date === day);
  // Keep the current day's pill in view.
  useEffect(() => {
    pills.current
      ?.querySelector<HTMLElement>('.on')
      ?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [day]);
  const photo = peek?.photos[0];
  return (
    <div className="phone-map" role="dialog" aria-label="Map">
      <div className="phone-map-bar">
        <button className="phone-map-back" onClick={onClose}>
          ‹ Timeline
        </button>
        <span className="phone-map-title">
          {dayIndex >= 0 ? `Day ${dayIndex + 1} · ${formatDay(day, 'short')}` : 'Whole trip'}
        </span>
        <button className="whole-chip phone-whole" onClick={() => onDay('')}>
          Whole trip
        </button>
      </div>
      <div className="phone-map-body">
        <MapView
          trip={trip}
          selected={peek ?? selected}
          focused={focused}
          day={day}
          onSelect={onPeek}
        />
      </div>
      <div className="day-pills" ref={pills}>
        {trip.days.map((d, i) => (
          <button key={d.date} className={d.date === day ? 'on' : ''} onClick={() => onDay(d.date)}>
            Day {i + 1} · {pillDate(d.date)}
          </button>
        ))}
      </div>
      {peek && (
        <button className="pin-card" onClick={() => onDetails(peek)}>
          {photo && <img src={photo.url} alt="" />}
          <span>
            <small>
              {KICKERS[peek.type]}
              {peek.time ? ` · ${peek.time}` : ''}
            </small>
            <strong>{peek.title}</strong>
            <em>Details ›</em>
          </span>
        </button>
      )}
    </div>
  );
}
