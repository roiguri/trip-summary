'use client';
import { useState } from 'react';
import type { EditData, Finding } from '../../../lib/edit-view';
import { dayLabel, useSave, type EditChange } from './useSave';

const MODE: Record<string, string> = {
  car: 'car',
  train: 'train',
  flight: 'flight',
  bus: 'bus',
  ferry: 'ferry',
  walk: 'on foot',
  bike: 'bike',
};
type Filter = 'all' | 'times' | 'stops' | 'unvisited';

/** What accepting a finding sets: the Timeline's times, and for a leg its mode. */
export function accept(f: Finding): EditChange[] {
  if (f.kind === 'times' || f.kind === 'mode') {
    const key = String(f.entryId);
    return [
      { target: 'entry', key, field: 'start_time', value: f.start },
      { target: 'entry', key, field: 'end_time', value: f.end },
      ...(f.kind === 'mode' ? [{ target: 'entry', key, field: 'mode', value: f.mode }] : []),
    ];
  }
  return [];
}

/** The inbox of what the Timeline found (DESIGN.md, "Edit mode", M2): a count down to zero, filters,
 *  and each finding's quick answers; picking one opens it beside the journey. */
export function Inbox({
  edit,
  onOpenEntry,
  onOpenStop,
}: {
  edit: EditData;
  onOpenEntry: (id: number) => void;
  onOpenStop: (key: string) => void;
}) {
  const { save, busy, error } = useSave(edit.tripId);
  const [filter, setFilter] = useState<Filter>('all');
  const of = (f: Finding): Filter =>
    f.kind === 'stop' ? 'stops' : f.kind === 'unvisited' ? 'unvisited' : 'times';
  const count = (k: Filter) => edit.findings.filter((f) => of(f) === k).length;
  const shown = edit.findings.filter((f) => filter === 'all' || of(f) === filter);
  const days = [...new Set(shown.map((f) => f.date))];
  const key = (f: Finding) => (f.kind === 'stop' ? f.suggestion.key : `${f.kind}-${f.entryId}`);

  return (
    <section className="inbox-panel" aria-label="From your Timeline">
      <div className="inbox-head">
        <h2>From your Timeline</h2>
        <span>{edit.findings.length ? `${edit.findings.length} to go` : 'All done'}</span>
      </div>
      {edit.findings.length > 0 && (
        <div className="inbox-tabs" role="tablist">
          {(
            [
              ['all', 'All', edit.findings.length],
              ['times', 'Times', count('times')],
              ['stops', 'New stops', count('stops')],
              ['unvisited', 'Not visited', count('unvisited')],
            ] as const
          ).map(([k, label, n]) => (
            <button
              key={k}
              role="tab"
              aria-selected={filter === k}
              className={filter === k ? 'on' : ''}
              onClick={() => setFilter(k)}
            >
              {label} {k === 'all' ? '' : n}
            </button>
          ))}
        </div>
      )}
      {!edit.findings.length && (
        <p className="inbox-empty">
          Nothing waits for you. When the Timeline is added (
          <a href={`/trips/${encodeURIComponent(edit.tripId)}/sources`}>sources</a>), what it found
          shows up here: actual times, travel modes, stops you didn’t plan, and planned stops with
          no visit.
        </p>
      )}
      {error && (
        <p className="src-error" role="alert">
          {error}
        </p>
      )}
      <div className="inbox-list">
        {days.map((d) => {
          const day = shown.filter((f) => f.date === d);
          const times = day.flatMap(accept);
          return (
            <div key={d} className="inbox-day">
              <div className="inbox-day-head">
                <b>{dayLabel(d)}</b>
                {times.length > 0 && (
                  <button className="link-button" disabled={busy} onClick={() => save(times)}>
                    Accept the day’s times
                  </button>
                )}
              </div>
              {day.map((f) => (
                <div key={key(f)} className={`finding ${f.kind}`}>
                  {f.kind === 'stop' && f.photos[0] && (
                    // eslint-disable-next-line @next/next/no-img-element -- stored media, served as is
                    <img src={f.photos[0].url} alt="" />
                  )}
                  <button
                    className="finding-main"
                    onClick={() =>
                      f.kind === 'stop' ? onOpenStop(f.suggestion.key) : onOpenEntry(f.entryId)
                    }
                  >
                    <b>
                      {f.kind === 'stop'
                        ? f.suggestion.kind === 'visit'
                          ? 'A stop you didn’t plan'
                          : `A journey by ${MODE[f.suggestion.mode ?? ''] ?? 'road'}`
                        : f.title}
                    </b>
                    <small>
                      {f.kind === 'times' && `planned ${f.planned} · visited ${f.start} – ${f.end}`}
                      {f.kind === 'mode' &&
                        `by ${MODE[f.planned ?? ''] ?? 'car'} (from the title) · Timeline: ${MODE[f.mode]}, ${f.start} – ${f.end}`}
                      {f.kind === 'unvisited' && `planned ${f.time} · no visit found`}
                      {f.kind === 'stop' &&
                        `${f.suggestion.time} – ${f.suggestion.endTime}${f.photos.length ? ` · ${f.photos.length} ${f.photos.length === 1 ? 'photo' : 'photos'}` : ''}`}
                    </small>
                  </button>
                  <span className="finding-acts">
                    {(f.kind === 'times' || f.kind === 'mode') && (
                      <>
                        <button
                          className="pill-button small primary"
                          disabled={busy}
                          onClick={() => save(accept(f))}
                        >
                          Use
                        </button>
                        <button
                          className="pill-button small"
                          disabled={busy}
                          onClick={() =>
                            save([
                              {
                                target: 'entry',
                                key: String(f.entryId),
                                field: 'proposal',
                                value: 'ignored',
                              },
                            ])
                          }
                        >
                          Ignore
                        </button>
                      </>
                    )}
                    {f.kind === 'unvisited' && (
                      <>
                        <button
                          className="pill-button small"
                          disabled={busy}
                          onClick={() => onOpenEntry(f.entryId)}
                        >
                          Link a visit
                        </button>
                        <button
                          className="pill-button small"
                          disabled={busy}
                          onClick={() =>
                            save([
                              {
                                target: 'entry',
                                key: String(f.entryId),
                                field: 'noVisit',
                                value: true,
                              },
                            ])
                          }
                        >
                          Fine as it is
                        </button>
                      </>
                    )}
                    {f.kind === 'stop' && (
                      <>
                        <button
                          className="pill-button small primary"
                          onClick={() => onOpenStop(f.suggestion.key)}
                        >
                          Open
                        </button>
                        <button
                          className="pill-button small"
                          disabled={busy}
                          onClick={() =>
                            save([
                              {
                                target: 'suggestion',
                                key: f.suggestion.key,
                                field: 'dismissed',
                                value: true,
                              },
                            ])
                          }
                        >
                          Dismiss
                        </button>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {edit.hiddenEntries.length > 0 && (
        <details className="inbox-hidden">
          <summary>Hidden from the journey · {edit.hiddenEntries.length}</summary>
          {edit.hiddenEntries.map((h) => (
            <div key={h.entryId} className="finding">
              <span className="finding-main">
                <b>{h.title}</b>
                <small>
                  {dayLabel(h.date)}
                  {h.time ? ` · ${h.time}` : ''}
                </small>
              </span>
              <span className="finding-acts">
                <button
                  className="pill-button small"
                  disabled={busy}
                  onClick={() =>
                    save([
                      {
                        target: 'entry',
                        key: String(h.entryId),
                        field: 'hidden',
                        value: undefined,
                      },
                    ])
                  }
                >
                  Show again
                </button>
              </span>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
