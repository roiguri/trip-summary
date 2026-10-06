'use client';
import { useContext, useState } from 'react';
import { ReviewContext } from './PhotoReview';
import type { Day, Entry, TransitMode } from '../../../lib/data';
import type { EditData } from '../../../lib/edit-view';
import { KICKERS } from '../../lib/format';
import { PlaceWindow } from './PlaceWindow';
import { EntryBlock } from './BlockEditor';
import { dayLabel, distance, mapsLink, metres, useSave, type EditChange } from './useSave';

const MODES: [TransitMode, string][] = [
  ['car', 'Car'],
  ['bus', 'Bus'],
  ['train', 'Train'],
  ['flight', 'Flight'],
  ['ferry', 'Ferry'],
  ['walk', 'On foot'],
  ['bike', 'Bike'],
];
const num = (id: string) => Number(id.replace(/^i/, '').replace(/-out$/, ''));

/** An entry's editor (DESIGN.md, "Edit mode", E1 and P1): every field optional, saved as the owner's
 *  edits, never into Jarvis; "Undo my edits" brings back what the sources say. */
export function EntryEditor({
  entry,
  days,
  edit,
  onClose,
}: {
  entry: Entry;
  days: Day[];
  edit: EditData;
  onClose: () => void;
}) {
  const { save, busy, error } = useSave(edit.tripId);
  const openReview = useContext(ReviewContext);
  // A loose moment or cluster has only its photos to edit ("Attach to…").
  const loose = entry.type === 'photo' || entry.type === 'cluster';
  const id = loose ? NaN : num(entry.id);
  const fromSuggestion = edit.added[String(id)];
  // An added stop's edits live under its suggestion; a planned entry's under its Jarvis ID.
  const set = (field: string, value?: string | number | boolean | null): EditChange =>
    fromSuggestion
      ? {
          target: 'suggestion',
          key: fromSuggestion,
          field: field === 'start_time' || field === 'end_time' ? 'times' : field,
          value,
        }
      : { target: 'entry', key: String(id), field, value };
  const [title, setTitle] = useState(entry.title);
  const [from, setFrom] = useState(entry.time);
  // A stay's end is its check-out time, kept in its check-out ("date · time").
  const endTime =
    entry.type === 'lodging' ? (entry.check_out?.split(' · ')[1] ?? '') : (entry.end_time ?? '');
  const [to, setTo] = useState(endTime);
  const [notes, setNotes] = useState(entry.notes);
  const [picked, setPicked] = useState<string[]>([]);
  // The place window open (it takes the editor's place).
  const [placing, setPlacing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [otherDay, setOtherDay] = useState('');

  const saveTimes = (a: string, b: string) =>
    save(
      fromSuggestion
        ? [set('times', a && b ? `${a}-${b}` : 'none')]
        : [set('start_time', a), set('end_time', b)],
    );
  const linked = edit.segments.find((s) => s.entryId === id);
  const unlinked = edit.edited[String(id)]?.includes('visit') && !linked;
  const wantKind = entry.type === 'transit' ? 'activity' : 'visit';
  const choices = edit.segments.filter(
    (s) => s.kind === wantKind && s.date === entry.day && s.key !== linked?.key,
  );
  const hidden = edit.hidden.filter((p) => p.entryId === id);
  const photos = [
    ...entry.photos.map((p) => ({
      id: p.id,
      url: p.thumb ?? p.url,
      time: p.time,
      hidden: false,
      star: !!p.highlighted,
    })),
    ...hidden.map((p) => ({ ...p, hidden: true, star: false })),
  ];
  // The photos shown on the journey, in order (DESIGN.md, "Edit mode, round 2", MP1): numbered in
  // the grid; "Show on the journey" puts the selected first.
  const canPick = !loose;
  const main = canPick ? entry.photos.slice(0, 3).map((p) => p.id) : [];
  const showOnJourney = () => {
    const chosen = picked.filter((p) => !hidden.some((h) => h.id === p));
    const order = [...chosen, ...main.filter((m) => !chosen.includes(m))].slice(0, 3);
    return save([set('photos', order.join(','))]).then(() => setPicked([]));
  };
  const allStarred = picked.length > 0 && picked.every((p) => photos.find((x) => x.id === p)?.star);
  const edited = edit.edited[String(id)] ?? [];
  const highlighted = !!entry.highlighted;

  // Where picked photos can go: this day's entries nearest in time first, its loose moments, or
  // another day's entries.
  const pickedTime = photos.find((p) => picked.includes(p.id))?.time ?? entry.time;
  const minutes = (t: string) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : 0);
  const targets = (date: string) =>
    (days.find((d) => d.date === date)?.entries ?? [])
      .filter(
        (e) =>
          (e.type === 'place' || e.type === 'lodging' || e.type === 'note') &&
          e.stay?.role !== 'checkout' &&
          e.id !== entry.id,
      )
      .sort(
        (a, b) =>
          Math.abs(minutes(a.time) - minutes(pickedTime)) -
          Math.abs(minutes(b.time) - minutes(pickedTime)),
      );
  const move = async (target: string | null) => {
    await save(picked.map((p) => ({ target: 'photo', key: p, field: 'entry', value: target })));
    setPicked([]);
    setMoving(false);
  };

  // Its place (DESIGN.md, "Place window"): the plan's, or one the owner chose (an added stop: where the
  // Timeline put it, or one chosen).
  const located = !loose && (entry.type === 'place' || entry.type === 'lodging');
  const original = fromSuggestion
    ? edit.placeOverrides.suggestions[fromSuggestion]
    : edit.placeOverrides.entries[String(id)];
  const used = fromSuggestion ? null : edit.entryPlaces[String(id)];
  const at = (p?: { lat: number | null; lng: number | null } | null) =>
    p && p.lat !== null && p.lng !== null ? { lat: p.lat, lng: p.lng } : null;
  const placedHow = !original
    ? fromSuggestion
      ? 'Where your Timeline put it'
      : 'From the plan'
    : fromSuggestion || used?.placeId
      ? 'Chosen in the place window'
      : 'A pin placed by hand';
  if (placing)
    return (
      <PlaceWindow
        tripId={edit.tripId}
        kind="entry"
        title={entry.title}
        planned={fromSuggestion ? null : at(original ?? used)}
        visit={fromSuggestion ? at(original ?? entry) : at(linked)}
        current={at(entry) && { ...at(entry)!, placeId: used?.placeId ?? null }}
        busy={busy}
        onClose={() => setPlacing(false)}
        onBack={
          original
            ? () =>
                save([
                  set('placeId', undefined),
                  set('lat', undefined),
                  set('lng', undefined),
                ]).then((ok) => ok && setPlacing(false))
            : undefined
        }
        onUse={(place, useName) =>
          save([
            set('placeId', place.id),
            set('lat', place.lat),
            set('lng', place.lng),
            ...(useName && place.name ? [set('title', place.name)] : []),
          ]).then((ok) => {
            if (ok && useName && place.name) setTitle(place.name);
            return ok;
          })
        }
      />
    );

  return (
    <section className="editor" aria-label={`Edit ${entry.title}`}>
      <div className="ed-kick">
        <span>
          {KICKERS[entry.type]} · {dayLabel(entry.day)}
        </span>
        <button className="link-button" onClick={onClose}>
          Close
        </button>
      </div>
      {!loose && (
        <>
          <label className="ed-field">
            Title
            <input
              id="ed-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title !== entry.title && save([set('title', title)])}
            />
          </label>
          <div className="ed-row">
            <label className="ed-field">
              {entry.type === 'transit' ? 'Leaves' : entry.type === 'lodging' ? 'Check-in' : 'From'}
              <input
                id="ed-from"
                type="time"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                onBlur={() => from !== entry.time && saveTimes(from, to)}
              />
            </label>
            <label className="ed-field">
              {entry.type === 'transit' ? 'Arrives' : entry.type === 'lodging' ? 'Check-out' : 'To'}
              <input
                id="ed-to"
                type="time"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                onBlur={() => to !== endTime && saveTimes(from, to)}
              />
            </label>
            <button
              className="link-button"
              disabled={busy}
              onClick={() => {
                setFrom('');
                setTo('');
                saveTimes('', '');
              }}
            >
              Clear times
            </button>
          </div>
        </>
      )}

      {entry.type === 'transit' && !fromSuggestion && (
        <div className="ed-modes" role="group" aria-label="Travelled by">
          <b>Travelled by</b>
          {MODES.map(([m, label]) => (
            <button
              key={m}
              className={entry.mode === m ? 'on' : ''}
              aria-pressed={entry.mode === m}
              disabled={busy}
              onClick={() => save([set('mode', m)])}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {located && (
        <div className="ed-place">
          <b>Place</b>
          <small>{placedHow}</small>
          <button className="link-button" onClick={() => setPlacing(true)}>
            Change
          </button>
        </div>
      )}

      {!fromSuggestion &&
        (entry.type === 'place' || entry.type === 'lodging' || entry.type === 'transit') && (
          <div className="ed-visit">
            {linked ? (
              <>
                <b>{linked.kind === 'visit' ? 'Visit' : 'Journey'} from your Timeline</b>
                <small>
                  {linked.time} – {linked.endTime}
                  {linked.mode ? ` · by ${linked.mode}` : ''}
                  {entry.lat !== null &&
                  entry.lng !== null &&
                  linked.lat !== null &&
                  linked.lng !== null
                    ? ` · ${distance(metres(entry.lat, entry.lng, linked.lat, linked.lng))} from the planned pin`
                    : ''}
                  {mapsLink(linked) && (
                    <>
                      {' · '}
                      <a href={mapsLink(linked)!} target="_blank" rel="noreferrer">
                        {linked.kind === 'activity'
                          ? 'Open the route in Google Maps'
                          : 'Open in Google Maps'}
                      </a>
                    </>
                  )}
                </small>
                <span className="acts">
                  {/* A stay's actual check-in and check-out come from all its visits: its finding. */}
                  {entry.type !== 'lodging' && (
                    <button
                      className="pill-button small primary"
                      disabled={
                        busy || (linked.time === entry.time && linked.endTime === entry.end_time)
                      }
                      onClick={() => {
                        setFrom(linked.time);
                        setTo(linked.endTime);
                        save([
                          set('start_time', linked.time),
                          set('end_time', linked.endTime),
                          ...(linked.mode ? [set('mode', linked.mode)] : []),
                        ]);
                      }}
                    >
                      Use these times
                    </button>
                  )}
                  <button
                    className="pill-button small"
                    disabled={busy}
                    onClick={() => save([set('visit', 'none')])}
                  >
                    Unlink
                  </button>
                </span>
              </>
            ) : (
              <>
                <b>{unlinked ? 'No visit: you unlinked it' : 'No visit found in your Timeline'}</b>
                {unlinked && (
                  <button
                    className="link-button"
                    disabled={busy}
                    onClick={() => save([set('visit', undefined)])}
                  >
                    Match it automatically again
                  </button>
                )}
              </>
            )}
            {choices.length > 0 && (
              <label className="ed-field">
                Link another {wantKind === 'visit' ? 'visit' : 'journey'} from {dayLabel(entry.day)}
                <select
                  id="ed-link"
                  value=""
                  disabled={busy}
                  onChange={(e) => e.target.value && save([set('visit', e.target.value)])}
                >
                  <option value="">Choose…</option>
                  {choices.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.time} – {s.endTime}
                      {s.mode ? ` · ${s.mode}` : ''}
                      {entry.lat !== null && entry.lng !== null && s.lat !== null && s.lng !== null
                        ? ` · ${distance(metres(entry.lat, entry.lng, s.lat, s.lng))} away`
                        : ''}
                      {s.entryId !== null ? ' · now with another entry' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

      {!loose && (
        <label className="ed-field">
          Note
          <textarea
            id="ed-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== entry.notes && save([set('notes', notes)])}
          />
        </label>
      )}

      {photos.length > 0 && (
        <div className="ed-photos">
          <div className="ed-photos-head">
            <b>
              Photos · {entry.photos.length}
              {hidden.length ? ` (+${hidden.length} hidden)` : ''}
            </b>
            {openReview && (
              <button
                className="link-button"
                onClick={() =>
                  openReview({
                    title: entry.title || 'Loose moment',
                    photoIds: photos.map((p) => p.id),
                    selected: picked,
                    view: picked.length ? 'grid' : 'one',
                  })
                }
              >
                Full screen
              </button>
            )}
          </div>
          <div className="ed-grid">
            {photos.map((p) => (
              <button
                key={p.id}
                className={`ed-photo ${picked.includes(p.id) ? 'on' : ''} ${p.hidden ? 'hidden' : ''}`}
                aria-pressed={picked.includes(p.id)}
                onClick={() =>
                  setPicked(
                    picked.includes(p.id) ? picked.filter((x) => x !== p.id) : [...picked, p.id],
                  )
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- stored media, served as is */}
                <img src={p.url} alt="" loading="lazy" />
                {main.includes(p.id) && (
                  <span
                    className="num"
                    aria-label={`Shown on the journey, ${main.indexOf(p.id) + 1}`}
                  >
                    {main.indexOf(p.id) + 1}
                  </span>
                )}
                {p.star && (
                  <b className="pstar" aria-label="A highlight">
                    ★
                  </b>
                )}
                {edit.newPhotoIds.includes(p.id) && !p.hidden && <em className="new">NEW</em>}
                {edit.cover === p.id && <em>COVER</em>}
                {p.hidden && <em>HIDDEN</em>}
              </button>
            ))}
          </div>
          {picked.length > 0 ? (
            <div className="ed-selbar">
              <b>{picked.length} selected</b>
              {canPick && (
                <button
                  className="pill-button small primary"
                  disabled={busy}
                  onClick={showOnJourney}
                >
                  Show on the journey
                </button>
              )}
              <button
                className="pill-button small"
                disabled={busy}
                onClick={() =>
                  save(
                    picked.map((p) => ({
                      target: 'photo',
                      key: p,
                      field: 'highlighted',
                      value: allStarred ? undefined : true,
                    })),
                  ).then(() => setPicked([]))
                }
              >
                {allStarred
                  ? 'Remove highlight'
                  : picked.length === 1
                    ? '★ Highlight photo'
                    : '★ Highlight photos'}
              </button>
              <button className="pill-button small" onClick={() => setMoving(!moving)}>
                {loose ? 'Attach to…' : 'Move to…'}
              </button>
              {!loose && (
                <button className="pill-button small" disabled={busy} onClick={() => move(null)}>
                  Make loose moments
                </button>
              )}
              {picked.every((p) => hidden.some((h) => h.id === p)) ? (
                <button
                  className="pill-button small"
                  disabled={busy}
                  onClick={() =>
                    save(
                      picked.map((p) => ({
                        target: 'photo',
                        key: p,
                        field: 'hidden',
                        value: undefined,
                      })),
                    ).then(() => setPicked([]))
                  }
                >
                  Show again
                </button>
              ) : (
                <button
                  className="pill-button small"
                  disabled={busy}
                  onClick={() =>
                    save(
                      picked.map((p) => ({
                        target: 'photo',
                        key: p,
                        field: 'hidden',
                        value: true,
                      })),
                    ).then(() => setPicked([]))
                  }
                >
                  Hide
                </button>
              )}
              {picked.length === 1 && (
                <button
                  className="pill-button small"
                  disabled={busy}
                  onClick={() =>
                    save([
                      { target: 'trip', key: edit.tripId, field: 'cover', value: picked[0] },
                    ]).then(() => setPicked([]))
                  }
                >
                  Set as the trip’s cover
                </button>
              )}
            </div>
          ) : (
            <small>
              {canPick ? '1 2 3: the photos shown on the journey. ' : ''}Select photos to show them
              on the journey, highlight, move or hide them, or make one the trip’s cover.
              {edited.includes('photos') && (
                <>
                  {' '}
                  <button
                    className="link-button"
                    disabled={busy}
                    onClick={() => save([set('photos', undefined)])}
                  >
                    Back to time order
                  </button>
                </>
              )}
            </small>
          )}
          {moving && picked.length > 0 && (
            <div className="ed-moveto" role="menu">
              <small>
                MOVE {picked.length} {picked.length === 1 ? 'PHOTO' : 'PHOTOS'} TO
              </small>
              {targets(entry.day).map((e) => (
                <button
                  key={e.id}
                  role="menuitem"
                  disabled={busy}
                  onClick={() => move(String(num(e.id)))}
                >
                  <b>{e.title}</b>
                  <span>{e.time || 'no time'} · same day</span>
                </button>
              ))}
              {!loose && (
                <button role="menuitem" disabled={busy} onClick={() => move(null)}>
                  <b>Loose moments · {dayLabel(entry.day)}</b>
                  <span>shown by their own time</span>
                </button>
              )}
              <label className="ed-field">
                Another day
                <select
                  id="ed-otherday"
                  value={otherDay}
                  onChange={(e) => setOtherDay(e.target.value)}
                >
                  <option value="">Choose a day…</option>
                  {days
                    .filter((d) => d.date !== entry.day)
                    .map((d) => (
                      <option key={d.date} value={d.date}>
                        {dayLabel(d.date)}
                        {d.title ? ` · ${d.title}` : ''}
                      </option>
                    ))}
                </select>
              </label>
              {otherDay &&
                targets(otherDay).map((e) => (
                  <button
                    key={e.id}
                    role="menuitem"
                    disabled={busy}
                    onClick={() => move(String(num(e.id)))}
                  >
                    <b>{e.title}</b>
                    <span>{e.time || 'no time'}</span>
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      <EntryBlock
        entry={entry}
        days={days}
        edit={edit}
        // A loose moment joins by its photos; anything else by its own edit.
        attach={(b) =>
          loose
            ? entry.photos.map((p) => ({ target: 'photo', key: p.id, field: 'block', value: b }))
            : [set('block', b)]
        }
        save={save}
        busy={busy}
      />

      <div className="ed-foot">
        {!fromSuggestion && !loose && (
          <>
            <button
              className={`toggle ${highlighted ? 'on' : ''}`}
              aria-pressed={highlighted}
              disabled={busy}
              onClick={() => save([set('highlighted', highlighted ? undefined : true)])}
            >
              ★ Highlight
            </button>
            <button
              className="toggle"
              disabled={busy}
              onClick={() => save([set('hidden', true)]).then((ok) => ok && onClose())}
            >
              Hide from the journey
            </button>
          </>
        )}
        {fromSuggestion ? (
          <button
            className="link-button danger"
            disabled={busy}
            onClick={() =>
              save(
                ['approved', 'title', 'times'].map((f) => ({
                  target: 'suggestion',
                  key: fromSuggestion,
                  field: f,
                  value: undefined,
                })),
              ).then((ok) => ok && onClose())
            }
          >
            Remove this stop
          </button>
        ) : (
          edited.length > 0 && (
            <button
              className="link-button"
              disabled={busy}
              onClick={() => save(edited.map((f) => set(f, undefined)))}
            >
              Undo my edits
            </button>
          )
        )}
      </div>
      {error && (
        <p className="src-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
