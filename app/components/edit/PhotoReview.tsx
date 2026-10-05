'use client';
import { createContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Day } from '../../../lib/data';
import type { EditData } from '../../../lib/edit-view';
import { useSave, type EditChange } from './useSave';

/** What to review: these photos, opening on one of them, in one view or the grid. */
export type ReviewScope = {
  title: string;
  photoIds: string[];
  start?: string;
  view?: 'one' | 'grid';
  selected?: string[];
};
export const ReviewContext = createContext<((scope: ReviewScope) => void) | null>(null);

type ReviewPhoto = {
  id: string;
  full: string;
  thumb: string;
  date: string;
  time: string;
  /** The drawn entry it's on (a planned entry's `i<n>`, or a loose moment's). */
  entryKey: string;
  entryTitle: string;
  planned: number | null;
  hidden: boolean;
  star: boolean;
  isNew: boolean;
  main: boolean;
};
/** A pending decision on a photo: nothing is saved until "Save all". */
type Staged = {
  hidden?: boolean;
  star?: boolean;
  move?: { to: number | null; label: string };
  main?: boolean;
  seen?: boolean;
};

/** Every photo of the trip as edit mode knows it, shown or hidden. */
function allPhotos(days: Day[], edit: EditData): Map<string, ReviewPhoto> {
  const out = new Map<string, ReviewPhoto>();
  const isNew = new Set(edit.newPhotoIds);
  for (const d of days)
    for (const e of d.entries) {
      if (e.stay?.role === 'checkout') continue;
      const planned = /^i\d+$/.test(e.id) ? Number(e.id.slice(1)) : null;
      e.photos.forEach((p, n) =>
        out.set(p.id, {
          id: p.id,
          full: p.url,
          thumb: p.thumb ?? p.url,
          date: p.date,
          time: p.time,
          entryKey: e.id,
          entryTitle: e.title || 'Loose moment',
          planned,
          hidden: false,
          star: !!p.highlighted,
          isNew: isNew.has(p.id),
          main: planned !== null && n < 3,
        }),
      );
    }
  for (const h of edit.hidden)
    if (!out.has(h.id))
      out.set(h.id, {
        id: h.id,
        full: h.url,
        thumb: h.url,
        date: h.date,
        time: h.time,
        entryKey: h.entryId === null ? '' : `i${h.entryId}`,
        entryTitle: 'Hidden',
        planned: h.entryId,
        hidden: true,
        star: false,
        isNew: false,
        main: false,
      });
  return out;
}

const weekday = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

/**
 * Reviewing photos full screen in edit mode (DESIGN.md, "Photo review"): one photo at a time or a
 * grid to select many; every decision (highlight, hide, move, show on the journey, keep) is staged
 * on the photos and saved together with "Save all", as one save.
 */
export function PhotoReview({
  scope,
  days,
  edit,
  onClose,
}: {
  scope: ReviewScope;
  days: Day[];
  edit: EditData;
  onClose: () => void;
}) {
  const { save, busy, error } = useSave(edit.tripId);
  const byId = useMemo(() => allPhotos(days, edit), [days, edit]);
  const photos = scope.photoIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const [view, setView] = useState<'one' | 'grid'>(scope.view ?? 'one');
  const [onlyNew, setOnlyNew] = useState(false);
  const shown = onlyNew ? photos.filter((p) => p.isNew) : photos;
  const [index, setIndex] = useState(() =>
    Math.max(0, scope.start ? photos.findIndex((p) => p.id === scope.start) : 0),
  );
  const current = shown[Math.min(index, shown.length - 1)];
  const pages = Math.max(1, Math.ceil(shown.length / 9));
  const [selected, setSelected] = useState<Set<string>>(new Set(scope.selected ?? []));
  const anchor = useRef<number | null>(null);
  const [staged, setStaged] = useState<Map<string, Staged>>(new Map());
  const [moving, setMoving] = useState(false);
  const [otherDay, setOtherDay] = useState('');
  const [leaving, setLeaving] = useState(false);
  // On a touch screen (no Shift): "Select range", then the range's last photo.
  const [ranging, setRanging] = useState(false);
  // A sideways swipe moves through the photos in the one-photo view.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  // The full photo shown, once loaded (until then its thumbnail is), and the grid's page of nine.
  const [loaded, setLoaded] = useState<string | null>(null);
  const PAGE = 9;
  const [page, setPage] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  // What the photo will be once saved: its own state with the staged decisions on top.
  const will = (p: ReviewPhoto) => {
    const s = staged.get(p.id) ?? {};
    return {
      hidden: s.hidden ?? p.hidden,
      star: s.star ?? p.star,
      move: s.move,
      main: s.main ?? p.main,
      isNew: p.isNew && !s.seen,
    };
  };
  // An action applies to the selection, else (one view) to the photo shown.
  const targets = () =>
    selected.size ? photos.filter((p) => selected.has(p.id)) : current ? [current] : [];
  const stage = (list: ReviewPhoto[], change: (p: ReviewPhoto) => Staged) =>
    setStaged((m) => {
      const next = new Map(m);
      for (const p of list) next.set(p.id, { ...next.get(p.id), ...change(p) });
      return next;
    });
  const unstage = (list: ReviewPhoto[]) =>
    setStaged((m) => {
      const next = new Map(m);
      for (const p of list) next.delete(p.id);
      return next;
    });
  const toggle = (key: 'star' | 'hidden') => {
    const list = targets();
    if (!list.length) return;
    const value = !will(list[0])[key];
    stage(list, () => ({ [key]: value }));
  };
  const keep = (list = targets()) =>
    stage(
      list.filter((p) => p.isNew),
      () => ({ seen: true }),
    );
  const onJourney = () =>
    stage(
      targets().filter((p) => p.planned !== null && !p.hidden),
      () => ({ main: true }),
    );
  const moveTo = (to: number | null, label: string) => {
    stage(targets(), () => ({ move: { to, label } }));
    setMoving(false);
  };

  // Where photos can go: the first target's day (its entries, its loose moments), or another day.
  const first = targets()[0];
  const entriesOf = (date: string) =>
    (days.find((d) => d.date === date)?.entries ?? []).filter(
      (e) => /^i\d+$/.test(e.id) && e.stay?.role !== 'checkout' && e.type !== 'transit',
    );

  // The pending decisions as edits, and a summary of them.
  const changes = (): EditChange[] => {
    const out: EditChange[] = [];
    const mainBy = new Map<number, string[]>();
    for (const p of photos) {
      const s = staged.get(p.id);
      if (!s) continue;
      if (s.hidden !== undefined && s.hidden !== p.hidden)
        out.push({ target: 'photo', key: p.id, field: 'hidden', value: s.hidden || undefined });
      if (s.star !== undefined && s.star !== p.star)
        out.push({ target: 'photo', key: p.id, field: 'highlighted', value: s.star || undefined });
      if (s.move)
        out.push({
          target: 'photo',
          key: p.id,
          field: 'entry',
          value: s.move.to === null ? null : String(s.move.to),
        });
      if (s.seen) out.push({ target: 'photo', key: p.id, field: 'seen', value: true });
      if (s.main && !p.main && p.planned !== null)
        mainBy.set(p.planned, [...(mainBy.get(p.planned) ?? []), p.id]);
    }
    // "Show on the journey": the chosen photos first, then the entry's current ones, three in all.
    for (const [entryId, chosen] of mainBy) {
      const now = days
        .flatMap((d) => d.entries)
        .find((e) => e.id === `i${entryId}`)
        ?.photos.slice(0, 3)
        .map((p) => p.id);
      const order = [...chosen, ...(now ?? []).filter((id) => !chosen.includes(id))].slice(0, 3);
      out.push({ target: 'entry', key: String(entryId), field: 'photos', value: order.join(',') });
    }
    return out;
  };
  const count = (pick: (s: Staged, p: ReviewPhoto) => boolean) =>
    photos.filter((p) => staged.has(p.id) && pick(staged.get(p.id)!, p)).length;
  const summary = [
    [count((s, p) => s.hidden !== undefined && s.hidden !== p.hidden && s.hidden), 'hidden'],
    [count((s, p) => s.hidden !== undefined && s.hidden !== p.hidden && !s.hidden), 'shown again'],
    [count((s, p) => s.star !== undefined && s.star !== p.star && s.star), 'highlighted'],
    [count((s, p) => s.star !== undefined && s.star !== p.star && !s.star), 'unhighlighted'],
    [count((s) => !!s.move), 'moved'],
    [count((s, p) => !!s.main && !p.main), 'on the journey'],
    [count((s) => !!s.seen), 'kept'],
  ]
    .filter(([n]) => n)
    .map(([n, what]) => `${n} ${what}`)
    .join(' · ');
  const pending = changes().length;

  async function saveAll() {
    const list = changes();
    if (!list.length) return;
    if (await save(list)) {
      setStaged(new Map());
      setSelected(new Set());
    }
  }
  const close = () => (pending ? setLeaving(true) : onClose());

  // Unsaved decisions are never lost silently: leaving the page asks too.
  useEffect(() => {
    if (!pending) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);

  useEffect(() => {
    box.current?.focus();
  }, []);

  // The neighbours' full photos load ahead, so a swipe shows the next one at once.
  useEffect(() => {
    if (view !== 'one' || !shown.length) return;
    const i = Math.min(index, shown.length - 1);
    for (const by of [1, -1, 2, -2]) {
      const p = shown[(i + by + shown.length) % shown.length];
      if (p) new Image().src = p.full;
    }
  }, [view, index, shown]);

  // The grid opens on the page of the photo being shown.
  const toGrid = () => {
    setPage(Math.floor(Math.min(index, Math.max(0, shown.length - 1)) / 9));
    setView('grid');
  };
  const step = (by: number) => {
    if (!shown.length) return;
    setIndex((i) => (Math.min(i, shown.length - 1) + by + shown.length) % shown.length);
    setMoving(false);
  };
  const select = (p: ReviewPhoto, n: number, range: boolean) => {
    // Read the range's start now: React runs the update later, after it has moved.
    const from = anchor.current;
    anchor.current = n;
    setSelected((s) => {
      const next = new Set(s);
      if (range && from !== null) {
        const [a, b] = [from, n].sort((x, y) => x - y);
        for (const q of shown.slice(a, b + 1)) next.add(q.id);
      } else if (next.has(p.id)) next.delete(p.id);
      else next.add(p.id);
      return next;
    });
  };
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('select, input')) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') return moving ? setMoving(false) : leaving ? setLeaving(false) : close();
    if (view === 'one' && k === 'arrowright') step(1);
    else if (view === 'one' && k === 'arrowleft') step(-1);
    else if (view === 'grid' && (k === 'arrowright' || k === 'pagedown'))
      setPage((n) => Math.min(pages - 1, n + 1));
    else if (view === 'grid' && (k === 'arrowleft' || k === 'pageup'))
      setPage((n) => Math.max(0, n - 1));
    else if (k === 's') toggle('star');
    else if (k === 'h') toggle('hidden');
    else if (k === 'k') keep();
    else if (k === 'm') setMoving((m) => !m);
    else if (k === 'g') view === 'one' ? toGrid() : setView('one');
    else if (k === 'a' && view === 'grid') setSelected(new Set(shown.map((p) => p.id)));
    else if (k === ' ' && view === 'one' && current) {
      e.preventDefault();
      select(current, index, false);
    } else return;
    e.preventDefault();
  };

  const marks = (p: ReviewPhoto) => {
    const w = will(p);
    return (
      <span className="rv-marks">
        {w.isNew && <em className="rv-new">NEW</em>}
        {w.star && <b className="pstar">★</b>}
        {w.main && p.planned !== null && <em className="rv-main">ON THE JOURNEY</em>}
        {w.move && <em className="rv-move">→ {w.move.label}</em>}
        {w.hidden && <em>HIDDEN</em>}
        {staged.has(p.id) && <i className="rv-pending" aria-label="Not saved yet" />}
      </span>
    );
  };
  const target = targets();
  const what = selected.size
    ? `${selected.size} selected`
    : current
      ? `${index + 1} of ${shown.length}`
      : '';

  return (
    <div
      className="photo-review"
      role="dialog"
      aria-modal="true"
      aria-label={`Review photos: ${scope.title}`}
      tabIndex={-1}
      ref={box}
      onKeyDown={onKey}
    >
      <header className="rv-top">
        <div className="rv-title">
          <b>{scope.title}</b>
          <small>
            {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
            {photos.some((p) => p.isNew)
              ? ` · ${photos.filter((p) => will(p).isNew).length} new`
              : ''}
          </small>
        </div>
        <div className="rv-switch" role="group" aria-label="View">
          <button
            className={view === 'one' ? 'on' : ''}
            aria-pressed={view === 'one'}
            onClick={() => setView('one')}
          >
            One photo
          </button>
          <button
            className={view === 'grid' ? 'on' : ''}
            aria-pressed={view === 'grid'}
            onClick={toGrid}
          >
            Grid
          </button>
        </div>
        <button className="rv-close" aria-label="Close" onClick={close}>
          ×
        </button>
      </header>

      {view === 'one' && current ? (
        <div
          className="rv-one"
          onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY })}
          onPointerUp={(e) => {
            const from = swipe.current;
            swipe.current = null;
            if (!from) return;
            const dx = e.clientX - from.x;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - from.y))
              step(dx < 0 ? 1 : -1);
          }}
        >
          <button className="rv-nav prev" aria-label="Previous photo" onClick={() => step(-1)}>
            ‹
          </button>
          <figure className={will(current).hidden ? 'faded' : ''}>
            {/* A fixed stage: the thumbnail (already loaded) shows at once, the full photo replaces it
                when it arrives, and nothing around it moves meanwhile. */}
            <div className="rv-stage">
              {/* eslint-disable-next-line @next/next/no-img-element -- stored media, served as is */}
              <img className="rv-low" src={current.thumb} alt="" />
              {/* eslint-disable-next-line @next/next/no-img-element -- stored media, served as is */}
              <img
                key={current.id}
                className={`rv-full ${loaded === current.id ? 'in' : ''}`}
                src={current.full}
                alt=""
                onLoad={() => setLoaded(current.id)}
              />
              {marks(current)}
            </div>
            <figcaption>
              <label className="rv-pick">
                <input
                  type="checkbox"
                  checked={selected.has(current.id)}
                  onChange={() => select(current, index, false)}
                />{' '}
                Select
              </label>
              <span>
                {current.entryTitle} · {weekday(current.date)} {current.time}
              </span>
              <span>{what}</span>
            </figcaption>
          </figure>
          <button className="rv-nav next" aria-label="Next photo" onClick={() => step(1)}>
            ›
          </button>
        </div>
      ) : (
        <div className="rv-grid-wrap">
          <div className="rv-filters">
            <button
              className="link-button"
              onClick={() => setSelected(new Set(shown.map((p) => p.id)))}
            >
              Select all
            </button>
            {pages > 1 && (
              <button
                className="link-button"
                onClick={() =>
                  setSelected(
                    (s) =>
                      new Set([
                        ...s,
                        ...shown.slice(page * PAGE, page * PAGE + PAGE).map((p) => p.id),
                      ]),
                  )
                }
              >
                Select page
              </button>
            )}
            <button className="link-button" onClick={() => setSelected(new Set())}>
              Select none
            </button>
            <button
              className={`link-button ${ranging ? 'on' : ''}`}
              aria-pressed={ranging}
              disabled={anchor.current === null}
              onClick={() => setRanging(!ranging)}
            >
              {ranging ? 'Now tap the last photo' : 'Select range'}
            </button>
            {photos.some((p) => p.isNew) && (
              <label>
                <input
                  type="checkbox"
                  checked={onlyNew}
                  onChange={(e) => {
                    setOnlyNew(e.target.checked);
                    setPage(0);
                  }}
                />{' '}
                Only new
              </label>
            )}
            <span>{what}</span>
          </div>
          <div className="rv-grid">
            {shown.slice(page * PAGE, page * PAGE + PAGE).map((p, k) => {
              const n = page * PAGE + k;
              return (
                <button
                  key={p.id}
                  className={`rv-tile ${selected.has(p.id) ? 'on' : ''} ${will(p).hidden ? 'faded' : ''}`}
                  aria-pressed={selected.has(p.id)}
                  onClick={(e) => {
                    select(p, n, e.shiftKey || ranging);
                    setRanging(false);
                  }}
                  onDoubleClick={() => {
                    setIndex(n);
                    setView('one');
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- stored media, served as is */}
                  <img src={p.thumb} alt="" />
                  {marks(p)}
                </button>
              );
            })}
          </div>
          {pages > 1 && (
            <div className="rv-pages">
              <button className="rv-act" disabled={page === 0} onClick={() => setPage(page - 1)}>
                ‹ Previous
              </button>
              <span>
                Page {page + 1} of {pages}
              </span>
              <button
                className="rv-act"
                disabled={page >= pages - 1}
                onClick={() => setPage(page + 1)}
              >
                Next ›
              </button>
            </div>
          )}
        </div>
      )}

      <footer className="rv-bar">
        <div className="rv-actions">
          <button className="rv-act" disabled={!target.length} onClick={() => toggle('star')}>
            ★ Highlight <kbd>S</kbd>
          </button>
          <button className="rv-act" disabled={!target.length} onClick={() => toggle('hidden')}>
            {target.length && will(target[0]).hidden ? 'Show again' : 'Hide'} <kbd>H</kbd>
          </button>
          <button className="rv-act" disabled={!target.length} onClick={() => setMoving(!moving)}>
            Move to… <kbd>M</kbd>
          </button>
          <button
            className="rv-act"
            disabled={!target.some((p) => p.planned !== null && !p.hidden)}
            onClick={onJourney}
          >
            Show on the journey
          </button>
          {photos.some((p) => p.isNew) && (
            <>
              <button
                className="rv-act"
                disabled={!target.some((p) => p.isNew)}
                onClick={() => keep()}
              >
                Keep <kbd>K</kbd>
              </button>
              <button className="rv-act" onClick={() => keep(photos)}>
                Mark all as seen
              </button>
            </>
          )}
          {target.some((p) => staged.has(p.id)) && (
            <button className="link-button" onClick={() => unstage(target)}>
              Undo marks
            </button>
          )}
        </div>
        <div className="rv-commit">
          {pending ? (
            <>
              <span>
                <b>
                  {pending} {pending === 1 ? 'change' : 'changes'}
                </b>
                {summary ? ` · ${summary}` : ''}
              </span>
              <button
                className="pill-button small"
                disabled={busy}
                onClick={() => setStaged(new Map())}
              >
                Discard
              </button>
              <button className="pill-button small primary" disabled={busy} onClick={saveAll}>
                {busy ? 'Saving…' : 'Save all'}
              </button>
            </>
          ) : (
            <span className="rv-hint">Decisions are marked on the photos and saved together.</span>
          )}
        </div>
        {error && (
          <p className="src-error" role="alert">
            {error}
          </p>
        )}
      </footer>

      {moving && first && (
        <div className="rv-moveto" role="menu" aria-label="Move to">
          <small>
            MOVE {target.length} {target.length === 1 ? 'PHOTO' : 'PHOTOS'} TO ·{' '}
            {weekday(first.date)}
          </small>
          {entriesOf(first.date).map((e) => (
            <button
              key={e.id}
              role="menuitem"
              onClick={() => moveTo(Number(e.id.slice(1)), e.title)}
            >
              <b>{e.title}</b>
              <span>{e.time || 'no time'}</span>
            </button>
          ))}
          <button role="menuitem" onClick={() => moveTo(null, 'Loose moments')}>
            <b>Loose moments</b>
            <span>shown by their own time</span>
          </button>
          <label className="ed-field">
            Another day
            <select id="rv-otherday" value={otherDay} onChange={(e) => setOtherDay(e.target.value)}>
              <option value="">Choose a day…</option>
              {days
                .filter((d) => d.date !== first.date)
                .map((d) => (
                  <option key={d.date} value={d.date}>
                    {weekday(d.date)}
                    {d.title ? ` · ${d.title}` : ''}
                  </option>
                ))}
            </select>
          </label>
          {otherDay &&
            entriesOf(otherDay).map((e) => (
              <button
                key={e.id}
                role="menuitem"
                onClick={() => moveTo(Number(e.id.slice(1)), e.title)}
              >
                <b>{e.title}</b>
                <span>{e.time || 'no time'}</span>
              </button>
            ))}
        </div>
      )}

      {leaving && (
        <div className="rv-leave" role="alertdialog" aria-label="Unsaved changes">
          <p>
            <b>
              {pending} {pending === 1 ? 'change' : 'changes'} not saved
            </b>
            {summary ? ` · ${summary}` : ''}
          </p>
          <div>
            <button
              className="pill-button small primary"
              disabled={busy}
              onClick={async () => {
                await saveAll();
                onClose();
              }}
            >
              Save all and close
            </button>
            <button className="pill-button small" onClick={onClose}>
              Discard and close
            </button>
            <button className="link-button" onClick={() => setLeaving(false)}>
              Stay
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
