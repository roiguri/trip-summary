'use client';
import type { Finding } from '../../../lib/edit-view';
import { mapsLink, type EditChange } from './useSave';

const MODE: Record<string, string> = {
  car: 'car',
  train: 'train',
  flight: 'flight',
  bus: 'bus',
  ferry: 'ferry',
  walk: 'on foot',
  bike: 'bike',
};

/** A finding's stable key: its suggestion's, or its kind and entry. */
export const findingKey = (f: Finding) =>
  f.kind === 'stop'
    ? f.suggestion.key
    : f.kind === 'photos'
      ? `photos-${f.entryKey}`
      : `${f.kind}-${f.entryId}`;

/** What accepting a finding sets: the Timeline's times, and for a leg its mode. */
export function accept(f: Finding): EditChange[] {
  if (f.kind !== 'times' && f.kind !== 'mode') return [];
  const key = String(f.entryId);
  return [
    { target: 'entry', key, field: 'start_time', value: f.start },
    { target: 'entry', key, field: 'end_time', value: f.end },
    ...(f.kind === 'mode' ? [{ target: 'entry', key, field: 'mode', value: f.mode }] : []),
  ];
}

/** What brings a set-aside finding back (it is then waiting again). */
function bringBack(f: Finding): EditChange[] {
  if (f.kind === 'stop')
    return [{ target: 'suggestion', key: f.suggestion.key, field: 'dismissed', value: undefined }];
  const key = String(f.entryId);
  if (f.kind === 'hidden') return [{ target: 'entry', key, field: 'hidden', value: undefined }];
  if (f.kind === 'unvisited') return [{ target: 'entry', key, field: 'noVisit', value: undefined }];
  return [{ target: 'entry', key, field: 'proposal', value: undefined }];
}

/** Something just resolved, shown on its entry with a way back (so a change never passes unseen). */
export type Done = {
  key: string;
  /** Its planned entry, or null with `entryKey` for a loose moment. */
  entryId: number | null;
  entryKey?: string;
  label: string;
  undo: EditChange[];
};
type Act = {
  save: (e: EditChange[], done?: Done[]) => void;
  busy: boolean;
  /** The finding being saved, shown as "Saving…" until the page has the change. */
  pending: string | null;
};

/** A finding about a planned entry, drawn under it on the timeline (DESIGN.md, "Edit mode, round
 *  2", T1): a proposed time or mode, or "no visit found"; set aside, faded with a way back (R1). */
export function FindingChip({
  f,
  act,
  current,
  onLink,
  undoUse,
}: {
  f: Finding;
  act: Act;
  current: boolean;
  onLink: () => void;
  /** What "Undo" after "Use" writes back: the entry's times (and mode) before. */
  undoUse: EditChange[];
}) {
  const { save, busy } = act;
  const key = findingKey(f);
  const entryKey = 'entryId' in f && f.entryId !== null ? String(f.entryId) : '';
  const done = (label: string, undo: EditChange[]): Done[] => [
    {
      key,
      entryId: entryKey ? Number(entryKey) : null,
      entryKey: f.kind === 'photos' ? f.entryKey : undefined,
      label,
      undo,
    },
  ];
  if (f.kind === 'photos') {
    // Keep: these very photos are no longer new; Undo marks them new again.
    const mark = (value: true | undefined): EditChange[] =>
      f.photoIds.map((id) => ({ target: 'photo', key: id, field: 'seen', value }));
    const n = `${f.count} new ${f.count === 1 ? 'photo' : 'photos'}`;
    if (act.pending === key)
      return (
        <span className="fnd saving" data-finding={key}>
          Saving…
        </span>
      );
    return (
      <span className={`fnd new-photos ${current ? 'current' : ''}`} data-finding={key}>
        <b>{n}</b>
        <button
          className="pill-button small primary"
          disabled={busy}
          onClick={() => save(mark(true), done(`Kept ${n}`, mark(undefined)))}
        >
          Keep
        </button>
        <button className="pill-button small" disabled={busy} onClick={onLink}>
          Review
        </button>
      </span>
    );
  }
  if (act.pending === key)
    return (
      <span className="fnd saving" data-finding={key}>
        Saving…
      </span>
    );
  if (f.setAside)
    return (
      <span className={`fnd set-aside ${current ? 'current' : ''}`} data-finding={findingKey(f)}>
        {f.kind === 'times' && (
          <>
            Ignored: <s>visited {`${f.start} – ${f.end}`}</s>
          </>
        )}
        {f.kind === 'mode' && (
          <>
            Ignored: <s>by {MODE[f.mode]}</s>
          </>
        )}
        {f.kind === 'unvisited' && <>No visit: fine as it is</>}
        <button className="link-button" disabled={busy} onClick={() => save(bringBack(f))}>
          Bring back
        </button>
      </span>
    );
  return (
    <span className={`fnd ${current ? 'current' : ''}`} data-finding={findingKey(f)}>
      {f.kind === 'times' && <b>Visited {`${f.start} – ${f.end}`}</b>}
      {f.kind === 'mode' && (
        <b>
          By {MODE[f.mode]}, {f.start} – {f.end}
        </b>
      )}
      {f.kind === 'unvisited' && <b>No visit found</b>}
      {(f.kind === 'times' || f.kind === 'mode') && (
        <>
          <button
            className="pill-button small primary"
            disabled={busy}
            onClick={() =>
              save(
                accept(f),
                done(
                  f.kind === 'mode'
                    ? 'Using the Timeline’s mode and times'
                    : 'Using the Timeline’s times',
                  undoUse,
                ),
              )
            }
          >
            Use
          </button>
          <button
            className="pill-button small"
            disabled={busy}
            onClick={() =>
              save(
                [{ target: 'entry', key: entryKey, field: 'proposal', value: 'ignored' }],
                done('Ignored the Timeline’s times', [
                  { target: 'entry', key: entryKey, field: 'proposal', value: undefined },
                ]),
              )
            }
          >
            Ignore
          </button>
        </>
      )}
      {f.kind === 'unvisited' && (
        <>
          <button className="pill-button small" disabled={busy} onClick={onLink}>
            Link a visit
          </button>
          <button
            className="pill-button small"
            disabled={busy}
            onClick={() =>
              save(
                [{ target: 'entry', key: entryKey, field: 'noVisit', value: true }],
                done('Fine without a visit', [
                  { target: 'entry', key: entryKey, field: 'noVisit', value: undefined },
                ]),
              )
            }
          >
            Fine as it is
          </button>
        </>
      )}
    </span>
  );
}

/** An unplanned stop or journey, or a hidden entry, drawn at its own time on the day's rail: a
 *  dashed entry with its answers (T1); set aside, faded with a way back (R1). */
export function GhostCard({
  f,
  act,
  current,
  onOpen,
}: {
  f: Finding;
  act: Act;
  current: boolean;
  onOpen: () => void;
}) {
  const { save, busy } = act;
  if (f.kind === 'hidden')
    return (
      <span className="ghost-card set-aside">
        <small>HIDDEN FROM THE JOURNEY{f.time ? ` · ${f.time}` : ''}</small>
        <strong>{f.title}</strong>
        <span className="acts">
          <button className="pill-button small" disabled={busy} onClick={() => save(bringBack(f))}>
            Show again
          </button>
        </span>
      </span>
    );
  if (f.kind !== 'stop') return null;
  const s = f.suggestion;
  const maps = mapsLink(s);
  const what =
    f.placeName ??
    (s.kind === 'visit'
      ? 'A stop you didn’t plan'
      : `A journey by ${MODE[s.mode ?? ''] ?? 'road'}`);
  if (f.setAside)
    return (
      <span className={`ghost-card set-aside ${current ? 'current' : ''}`}>
        <small>
          DISMISSED · {s.time} – {s.endTime}
        </small>
        <strong>{what}</strong>
        <span className="acts">
          <button className="pill-button small" disabled={busy} onClick={() => save(bringBack(f))}>
            Bring back
          </button>
        </span>
      </span>
    );
  return (
    <span className={`ghost-card ${current ? 'current' : ''}`}>
      <small>
        NOT IN YOUR PLAN · {s.time} – {s.endTime}
        {f.photoCount ? ` · ${f.photoCount} ${f.photoCount === 1 ? 'PHOTO' : 'PHOTOS'}` : ''}
      </small>
      <strong>{what}</strong>
      {f.photos.length > 0 && (
        <span className="loose">
          {f.photos.slice(0, 4).map((p) => (
            // eslint-disable-next-line @next/next/no-img-element -- stored media, served as is
            <img key={p.id} src={p.url} alt="" loading="lazy" />
          ))}
        </span>
      )}
      <span className="acts">
        <button className="pill-button small primary" onClick={onOpen}>
          Add…
        </button>
        {s.kind === 'visit' && (
          <button className="pill-button small" onClick={onOpen}>
            It’s a planned stop
          </button>
        )}
        <button
          className="pill-button small"
          disabled={busy}
          onClick={() =>
            save([{ target: 'suggestion', key: s.key, field: 'dismissed', value: true }])
          }
        >
          Dismiss
        </button>
        {maps && (
          <a className="link-button" href={maps} target="_blank" rel="noreferrer">
            Google Maps
          </a>
        )}
      </span>
    </span>
  );
}

/** A finding just resolved, on its entry: what was done, and Undo. */
export function DoneChip({ d, act }: { d: Done; act: Act }) {
  return (
    <span className="fnd done">
      ✓ {d.label} ·{' '}
      <button className="link-button" disabled={act.busy} onClick={() => act.save(d.undo)}>
        Undo
      </button>
    </span>
  );
}
