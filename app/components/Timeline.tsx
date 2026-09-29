'use client';
import { useEffect, useState } from 'react';
import type { Day, Entry } from '../../lib/data';
import { formatDay, noteDir, transitTimes } from '../lib/format';
import { EntryCaption } from './EntryCaption';
import { TransitIcon } from './icons';
import { LanePath, laneClass } from './lanes';

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

/** One entry's byline under its title. */
function byline(e: Entry) {
  if (e.type === 'cluster' || e.type === 'photo')
    // The card already says "photo"; the byline is just the time (user decision).
    return `${e.time}${e.end_time ? ' – ' + e.end_time : ''}`;
  if (e.type === 'lodging')
    return `${e.stay?.role === 'checkout' ? 'CHECK-OUT' : 'CHECK-IN'} · ${e.time}`;
  if (e.type === 'transit') return transitTimes(e);
  if (e.type === 'note') return `NOTE · ${e.time}`;
  return ((e.tags[0] || 'PLACE') + ' · ' + e.time).toUpperCase();
}

/**
 * The rail: day banners, entries on alternating sides, multi-day lanes and their labels and end
 * markers, and end-of-day stay markers.
 */
export function Timeline({
  days,
  railRef,
  selected,
  album,
  entriesById,
  onChoose,
  onShowAlbum,
}: {
  days: Day[];
  railRef: React.RefObject<HTMLElement | null>;
  selected: Entry | null;
  album: string | null;
  entriesById: Map<string, Entry>;
  onChoose: (e: Entry, from?: string) => void;
  onShowAlbum: (date: string) => void;
}) {
  // Multi-day focus: the hovered span, else the selected one; its lane, labels and end marker
  // are emphasised and other lanes fade (only when more than one lane is drawn).
  const [hoverSpan, setHoverSpan] = useState<string | null>(null);
  // Drawn multi-day lanes, measured in rail coordinates: start node centre (x, y0) and end
  // diamond centre (y1, same x on the rail).
  const [spanLanes, setSpanLanes] = useState<
    { id: string; lane: number; x: number; y0: number; y1: number }[]
  >([]);
  const focusSpan = hoverSpan ?? (selected?.span_end && !album ? selected.id : null);
  const spanFocus = (id: string) =>
    focusSpan === id ? 'is-focus' : focusSpan && spanLanes.length > 1 ? 'is-dim' : '';
  const hoverProps = (id: string) => ({
    onMouseEnter: () => setHoverSpan(id),
    onMouseLeave: () => setHoverSpan((h) => (h === id ? null : h)),
    onFocus: () => setHoverSpan(id),
    onBlur: () => setHoverSpan((h) => (h === id ? null : h)),
  });
  // A stay's check-out entry and end-of-day markers open the stay itself (its check-in entry).
  const resolveStay = (e: Entry) =>
    e.stay?.role === 'checkout' ? (entriesById.get(e.stay.stayId) ?? e) : e;

  useEffect(() => {
    function measure() {
      const root = railRef.current;
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
    if (railRef.current) resize.observe(railRef.current);
    window.addEventListener('resize', measure);
    return () => {
      resize.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [railRef]);

  return (
    <section className="rail" ref={railRef}>
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
            onClick={() => onShowAlbum(d.date)}
          >
            <span>
              Day {di + 1} - {formatDay(d.date)}
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
                  const start = entriesById.get(s.id);
                  if (start) onChoose(start);
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
                <TimelineEntry
                  key={item.entry.id}
                  entry={item.entry}
                  side={item.index % 2 === 0 ? 'left' : 'right'}
                  active={
                    !!selected &&
                    !album &&
                    selected.id === (item.entry.stay?.stayId ?? item.entry.id)
                  }
                  onClick={() =>
                    item.entry.stay?.role === 'checkout'
                      ? onChoose(resolveStay(item.entry), item.entry.day)
                      : onChoose(item.entry)
                  }
                  hover={item.entry.span_end ? hoverProps(item.entry.id) : {}}
                />
              ),
            )}
            {d.nights.map((n) => (
              <button
                key={`night-${n.stayId}`}
                className={`stay-night ${selected?.id === n.stayId && !album ? 'active' : ''}`}
                onClick={() => {
                  const stay = entriesById.get(n.stayId);
                  if (stay) onChoose(stay, d.date);
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
  );
}

/** One entry on the rail: its node and connector, title, byline, photos and note. */
function TimelineEntry({
  entry,
  side,
  active,
  onClick,
  hover,
}: {
  entry: Entry;
  side: 'left' | 'right';
  active: boolean;
  onClick: () => void;
  hover: object;
}) {
  return (
    <button
      data-entry-id={entry.id}
      className={`entry ${entry.span_end ? 'multiday-start' : ''} ${active ? 'active' : ''} type-${entry.type} ${entry.title ? '' : 'no-title'} entry-${side}`}
      onClick={onClick}
      {...hover}
      style={
        entry.outer !== undefined ? ({ '--outer': entry.outer } as React.CSSProperties) : undefined
      }
    >
      <span className="entry-node">{entry.mode && <TransitIcon mode={entry.mode} />}</span>
      <span
        className="entry-content"
        dir={entry.type === 'note' ? noteDir(entry.notes || entry.title) : undefined}
      >
        {entry.title && <strong>{entry.title}</strong>}
        <small>{byline(entry)}</small>
        {entry.type === 'transit' && (
          <span className="transit-route">
            {entry.from_location || 'Origin'} → {entry.to_location || 'Destination'}
          </span>
        )}
        {entry.photos.length > 0 && (
          <span
            className="stack"
            style={{ '--n': Math.min(entry.photos.length, 3) } as React.CSSProperties}
          >
            {entry.photos.slice(0, entry.type === 'photo' ? 1 : 3).map((p, i) => (
              <img key={p.id} src={p.url} alt="" style={{ '--i': i } as React.CSSProperties} />
            ))}
          </span>
        )}
        {entry.notes && (entry.type === 'place' || entry.stay?.role === 'checkin') && (
          <EntryCaption text={entry.notes} />
        )}
        {entry.notes && entry.type === 'note' && <EntryCaption text={entry.notes} lines={4} />}
      </span>
    </button>
  );
}
