'use client';
import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Day } from '../../../lib/data';
import type { EditData, Finding } from '../../../lib/edit-view';
import { dayLabel, distance, mapsLink, metres, useSave } from './useSave';

maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

/** A small, still map: the stop, and the nearest planned stop for scale. */
function MiniMap({ at, near }: { at: [number, number]; near: [number, number] | null }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!box.current) return;
    const m = new maplibregl.Map({
      container: box.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [at[1], at[0]],
      zoom: 13,
      interactive: false,
      attributionControl: { compact: true },
    });
    const dot = (cls: string) => Object.assign(document.createElement('span'), { className: cls });
    new maplibregl.Marker({ element: dot('mini-pin') }).setLngLat([at[1], at[0]]).addTo(m);
    if (near) {
      new maplibregl.Marker({ element: dot('mini-pin plan') })
        .setLngLat([near[1], near[0]])
        .addTo(m);
      m.fitBounds(
        [
          [Math.min(at[1], near[1]), Math.min(at[0], near[0])],
          [Math.max(at[1], near[1]), Math.max(at[0], near[0])],
        ],
        { padding: 40, maxZoom: 15, duration: 0 },
      );
    }
    return () => m.remove();
  }, [at, near]);
  return <div className="mini-map" ref={box} />;
}

/** A stop or journey the plan doesn't have (DESIGN.md, "Edit mode", S1): when, where, its photos, and
 *  three ways to resolve it. Without the Places API there's no name: Google Maps confirms the place. */
export function SuggestionCard({
  finding,
  days,
  edit,
  onClose,
}: {
  finding: Extract<Finding, { kind: 'stop' }>;
  days: Day[];
  edit: EditData;
  onClose: () => void;
}) {
  const { save, busy, error } = useSave(edit.tripId);
  const s = finding.suggestion;
  const [choice, setChoice] = useState<'add' | 'link'>('add');
  const [name, setName] = useState('');
  const [times, setTimes] = useState<'keep' | 'other' | 'none'>('keep');
  const [from, setFrom] = useState(s.time);
  const [to, setTo] = useState(s.endTime);
  const at: [number, number] | null = s.lat !== null && s.lng !== null ? [s.lat, s.lng] : null;
  const planned = (days.find((d) => d.date === s.date)?.entries ?? [])
    .filter(
      (e) =>
        (e.type === 'place' || e.type === 'lodging') &&
        e.stay?.role !== 'checkout' &&
        e.id.startsWith('i') &&
        !e.id.startsWith('i-'),
    )
    .map((e) => ({
      e,
      m: at && e.lat !== null && e.lng !== null ? metres(at[0], at[1], e.lat, e.lng) : Infinity,
    }))
    .sort((a, b) => a.m - b.m);
  const nearest = planned.find((p) => p.m < Infinity);
  const minutes = Math.round(
    (Date.parse(`2000-01-01T${s.endTime}:00Z`) - Date.parse(`2000-01-01T${s.time}:00Z`)) / 60_000,
  );
  const maps = mapsLink(s.lat, s.lng, s.placeId);

  const add = () =>
    save([
      { target: 'suggestion', key: s.key, field: 'approved', value: true },
      ...(name.trim()
        ? [{ target: 'suggestion', key: s.key, field: 'title', value: name.trim() }]
        : []),
      ...(times === 'none'
        ? [{ target: 'suggestion', key: s.key, field: 'times', value: 'none' }]
        : times === 'other' && from && to
          ? [{ target: 'suggestion', key: s.key, field: 'times', value: `${from}-${to}` }]
          : []),
    ]).then((ok) => ok && onClose());

  return (
    <section className="editor" aria-label="A stop you didn’t plan">
      <div className="ed-kick">
        <span>NOT IN YOUR PLAN · {dayLabel(s.date)}</span>
        <button className="link-button" onClick={onClose}>
          Back to the inbox
        </button>
      </div>
      {at && <MiniMap at={at} near={nearest ? [nearest.e.lat!, nearest.e.lng!] : null} />}
      <p className="sg-meta">
        <b>
          {s.time} – {s.endTime}
        </b>{' '}
        · {minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`}
        {s.kind === 'activity' && s.mode ? ` · by ${s.mode}` : ''}
        {finding.photos.length
          ? ` · ${finding.photos.length} ${finding.photos.length === 1 ? 'photo' : 'photos'}`
          : ''}
        {nearest ? ` · ${distance(nearest.m)} from ${nearest.e.title}` : ''}
        {maps && (
          <>
            {' · '}
            <a href={maps} target="_blank" rel="noreferrer">
              Open in Google Maps
            </a>
          </>
        )}
      </p>
      {finding.photos.length > 0 && (
        <div className="ed-grid">
          {finding.photos.slice(0, 6).map((p) => (
            // eslint-disable-next-line @next/next/no-img-element -- stored media, served as is
            <img key={p.id} src={p.url} alt="" className="ed-photo-img" loading="lazy" />
          ))}
        </div>
      )}

      <div className={`sg-choice ${choice === 'add' ? 'on' : ''}`}>
        <label className="sg-radio">
          <input
            type="radio"
            name="sg-choice"
            checked={choice === 'add'}
            onChange={() => setChoice('add')}
          />{' '}
          <b>Add as a new {s.kind === 'visit' ? 'stop' : 'journey'}</b>
        </label>
        {choice === 'add' && (
          <>
            <label className="ed-field">
              Name
              <input
                id="sg-name"
                value={name}
                placeholder={
                  s.kind === 'visit'
                    ? 'For example: Sunset at the point'
                    : 'For example: Drive to the coast'
                }
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="ed-row" role="radiogroup" aria-label="Its times">
              {(
                [
                  ['keep', `Keep ${s.time} – ${s.endTime}`],
                  ['other', 'Other times'],
                  ['none', 'No times'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  role="radio"
                  aria-checked={times === k}
                  className={`radio ${times === k ? 'on' : ''}`}
                  onClick={() => setTimes(k)}
                >
                  {label}
                </button>
              ))}
            </div>
            {times === 'other' && (
              <div className="ed-row">
                <label className="ed-field">
                  From
                  <input
                    id="sg-from"
                    type="time"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label className="ed-field">
                  To
                  <input
                    id="sg-to"
                    type="time"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
              </div>
            )}
            <button className="pill-button small primary" disabled={busy} onClick={add}>
              Add to the journey
            </button>
          </>
        )}
      </div>
      {s.kind === 'visit' && planned.length > 0 && (
        <div className={`sg-choice ${choice === 'link' ? 'on' : ''}`}>
          <label className="sg-radio">
            <input
              type="radio"
              name="sg-choice"
              checked={choice === 'link'}
              onChange={() => setChoice('link')}
            />{' '}
            <b>It’s a stop already in the plan</b>
          </label>
          {choice === 'link' && (
            <div className="sg-plan">
              <small>It takes this visit’s times (to accept) and its photos. Nearest first:</small>
              {planned.slice(0, 6).map(({ e, m }) => (
                <button
                  key={e.id}
                  disabled={busy}
                  onClick={() =>
                    save([
                      { target: 'entry', key: e.id.slice(1), field: 'visit', value: s.key },
                    ]).then((ok) => ok && onClose())
                  }
                >
                  <b>{e.title}</b>
                  <span>
                    {m < Infinity ? `${distance(m)} · ` : ''}planned {e.time || 'with no time'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="sg-choice">
        <button
          className="link-button"
          disabled={busy}
          onClick={() =>
            save([{ target: 'suggestion', key: s.key, field: 'dismissed', value: true }]).then(
              (ok) => ok && onClose(),
            )
          }
        >
          Dismiss: it won’t be suggested again
        </button>
      </div>
      {error && (
        <p className="src-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
