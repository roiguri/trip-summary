'use client';
import { useState } from 'react';
import type { Day, Entry } from '../../../lib/data';
import type { BlockDef, EditData } from '../../../lib/edit-view';
import { BLOCK_COLORS, sheetPhotos } from '../../../lib/blocks';
import { useSave, type EditChange } from './useSave';

/** A few emoji to start from; any other can be typed. */
const EMOJI = ['🚲', '🥾', '🍜', '⛵', '🏄', '🚗', '🏛️', '⛰️', '🌋', '🍷', '🎢', '✨'];

/** A new block's ID: "b" and letters or digits (lib/edits.ts). */
export const newBlockId = () =>
  `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** What a block's fields become, as edits (empty ones undo). */
export const blockFields = (
  id: string,
  f: { title: string; emoji: string; color: string; note: string },
): EditChange[] =>
  (['title', 'emoji', 'color', 'note'] as const).map((field) => ({
    target: 'block',
    key: id,
    field,
    value: f[field] || undefined,
  }));

/** A block's name, emoji, colour and note (DESIGN.md, "Blocks"). */
export function BlockForm({
  start,
  submit,
  busy,
  onSubmit,
  onCancel,
}: {
  start: { title: string; emoji: string; color: string; note: string };
  submit: string;
  busy: boolean;
  onSubmit: (f: { title: string; emoji: string; color: string; note: string }) => void;
  onCancel?: () => void;
}) {
  const [f, setF] = useState(start);
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  return (
    <div className="block-form">
      <label className="ed-field">
        Name
        <input
          id="bk-title"
          value={f.title}
          placeholder="For example: Bike along the coast"
          onChange={(e) => set('title', e.target.value)}
        />
      </label>
      <div className="ed-field">
        Emoji
        <div className="bk-emojis" role="radiogroup" aria-label="Emoji">
          {EMOJI.map((e) => (
            <button
              key={e}
              role="radio"
              aria-checked={f.emoji === e}
              className={f.emoji === e ? 'on' : ''}
              onClick={() => set('emoji', f.emoji === e ? '' : e)}
            >
              {e}
            </button>
          ))}
          <input
            id="bk-emoji"
            aria-label="Another emoji"
            value={EMOJI.includes(f.emoji) ? '' : f.emoji}
            placeholder="or type"
            maxLength={4}
            onChange={(e) => set('emoji', e.target.value)}
          />
        </div>
      </div>
      <div className="ed-field">
        Colour
        <div className="bk-colors" role="radiogroup" aria-label="Colour">
          {Object.entries(BLOCK_COLORS).map(([name, hex]) => (
            <button
              key={name}
              role="radio"
              aria-checked={f.color === name}
              aria-label={name}
              className={f.color === name ? 'on' : ''}
              style={{ background: hex }}
              onClick={() => set('color', name)}
            />
          ))}
        </div>
      </div>
      <label className="ed-field">
        Note (optional)
        <textarea
          id="bk-note"
          rows={2}
          value={f.note}
          onChange={(e) => set('note', e.target.value)}
        />
      </label>
      <div className="ed-row">
        <button
          className="pill-button small primary"
          disabled={busy || !f.title.trim()}
          onClick={() => onSubmit({ ...f, title: f.title.trim() })}
        >
          {submit}
        </button>
        {onCancel && (
          <button className="pill-button small" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

/** A block's own editor, from its ticket in edit mode: its fields, what's attached, and Ungroup. */
export function BlockEditor({
  block,
  days,
  edit,
  onClose,
}: {
  block: BlockDef;
  days: Day[];
  edit: EditData;
  onClose: () => void;
}) {
  const { save, busy, error } = useSave(edit.tripId);
  const [ungrouping, setUngrouping] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const field = (f: string, value?: string | boolean): EditChange => ({
    target: 'block',
    key: block.id,
    field: f,
    value,
  });
  // Its photos, and the six on its contact sheet (chosen, then highlights, then time order).
  const photos = days
    .flatMap((d) => d.entries)
    .filter((e) => e.block === block.id)
    .flatMap((e) => e.photos);
  const chosen = block.photos ? block.photos.split(',') : [];
  const sheet = sheetPhotos(photos, chosen).map((p) => p.id);
  const showOnBlock = () => {
    const order = [...picked, ...sheet.filter((m) => !picked.includes(m))].slice(0, 6);
    return save([field('photos', order.join(','))]).then(() => setPicked([]));
  };
  const entries = days.flatMap((d) => d.entries);
  const entryOf = (m: BlockDef['members'][number]) =>
    m.target === 'entry'
      ? entries.find((x) => x.id === `i${m.key}`)
      : m.target === 'photo'
        ? entries.find((x) => x.photos.some((p) => p.id === m.key))
        : entries.find((x) => edit.added[x.id.slice(1)] === m.key);
  // What's attached, by the entry it shows as (a loose moment's photos are one line).
  const attached = new Map<string, { label: string; members: BlockDef['members'] }>();
  for (const m of block.members) {
    const e = entryOf(m);
    const id = e?.id ?? `gone-${m.target}-${m.key}`;
    const label = e
      ? `${e.title || (e.type === 'photo' ? 'A photo' : 'Photos')} · ${e.day.slice(5)}${e.time ? ` ${e.time}` : ''}`
      : 'No longer on the journey';
    attached.set(id, { label, members: [...(attached.get(id)?.members ?? []), m] });
  }
  const detach = (m: BlockDef['members'][number]): EditChange => ({
    target: m.target,
    key: m.key,
    field: 'block',
    value: undefined,
  });
  return (
    <section className="editor" aria-label={`Edit block ${block.title}`}>
      <div className="ed-kick">
        <span>THE BLOCK</span>
        <button className="link-button" onClick={onClose}>
          Close
        </button>
      </div>
      <BlockForm
        start={{ title: block.title, emoji: block.emoji, color: block.color, note: block.note }}
        submit="Save"
        busy={busy}
        onSubmit={(f) => save(blockFields(block.id, f))}
      />
      <div className="ed-foot">
        <button
          className={`toggle ${block.collapsed ? 'on' : ''}`}
          aria-pressed={block.collapsed}
          disabled={busy}
          onClick={() => save([field('collapsed', block.collapsed ? undefined : true)])}
        >
          Show collapsed
        </button>
        <small>Folded to its photos and stops; anyone can unfold it.</small>
      </div>
      {photos.length > 0 && (
        <div className="ed-photos">
          <div className="ed-photos-head">
            <b>Photos · {photos.length}</b>
          </div>
          <div className="ed-grid">
            {photos.map((p) => (
              <button
                key={p.id}
                className={`ed-photo ${picked.includes(p.id) ? 'on' : ''}`}
                aria-pressed={picked.includes(p.id)}
                onClick={() =>
                  setPicked(
                    picked.includes(p.id) ? picked.filter((x) => x !== p.id) : [...picked, p.id],
                  )
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- stored media, served as is */}
                <img src={p.thumb ?? p.url} alt="" loading="lazy" />
                {sheet.includes(p.id) && (
                  <span className="num" aria-label={`On the block, ${sheet.indexOf(p.id) + 1}`}>
                    {sheet.indexOf(p.id) + 1}
                  </span>
                )}
                {p.highlighted && (
                  <b className="pstar" aria-label="A highlight">
                    ★
                  </b>
                )}
              </button>
            ))}
          </div>
          {picked.length > 0 ? (
            <div className="ed-selbar">
              <b>{picked.length} selected</b>
              <button className="pill-button small primary" disabled={busy} onClick={showOnBlock}>
                Show on the block
              </button>
              <button className="pill-button small" onClick={() => setPicked([])}>
                Clear
              </button>
            </div>
          ) : (
            <small>
              1–6: the photos on the block’s contact sheet. Select photos to put them first.
              {chosen.length > 0 && (
                <>
                  {' '}
                  <button
                    className="link-button"
                    disabled={busy}
                    onClick={() => save([field('photos', undefined)])}
                  >
                    Back to time order
                  </button>
                </>
              )}
            </small>
          )}
        </div>
      )}
      <div className="ed-visit">
        <b>Attached · {attached.size}</b>
        <small>
          The block runs from its first attached entry to its last; everything between belongs to
          it. Attach more with “Add to block” in an entry’s editor.
        </small>
        {[...attached].map(([id, a]) => (
          <span key={id} className="bk-member">
            {a.label}
            <button
              className="link-button"
              disabled={busy}
              onClick={() => save(a.members.map(detach))}
            >
              Remove
            </button>
          </span>
        ))}
      </div>
      {ungrouping ? (
        <div className="ed-selbar">
          <b>Ungroup “{block.title}”?</b> Its entries stay on the journey.
          <button
            className="pill-button small primary"
            disabled={busy}
            onClick={() =>
              save([
                ...block.members.map(detach),
                ...blockFields(block.id, { title: '', emoji: '', color: '', note: '' }),
                field('collapsed', undefined),
                field('photos', undefined),
              ]).then((ok) => ok && onClose())
            }
          >
            Ungroup
          </button>
          <button className="pill-button small" onClick={() => setUngrouping(false)}>
            Keep it
          </button>
        </div>
      ) : (
        <div className="ed-foot">
          <button className="link-button danger" onClick={() => setUngrouping(true)}>
            Ungroup the block
          </button>
        </div>
      )}
      {error && (
        <p className="src-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** An entry's Block section: start a block from it, attach it to one, or (at a block's first or
 *  last entry) take it out, which shortens the block. */
export function EntryBlock({
  entry,
  days,
  edit,
  attach,
  save,
  busy,
}: {
  entry: Entry;
  days: Day[];
  edit: EditData;
  /** The edits that put this entry in a block (or, with none, take it out). */
  attach: (block?: string) => EditChange[];
  save: (changes: EditChange[]) => Promise<boolean>;
  busy: boolean;
}) {
  const [mode, setMode] = useState<'' | 'new' | 'add'>('');
  const block = entry.block ? edit.blocks.find((b) => b.id === entry.block) : undefined;
  if (block) {
    const inBlock = days.flatMap((d) => d.entries).filter((e) => e.block === block.id);
    const end = inBlock[0]?.id === entry.id || inBlock.at(-1)?.id === entry.id;
    return (
      <div className="ed-visit ed-block">
        <b>
          In {block.emoji} {block.title}
        </b>
        {end ? (
          <button className="link-button" disabled={busy} onClick={() => save(attach(undefined))}>
            Remove from the block
          </button>
        ) : (
          <small>Inside the block. It runs from its first entry to its last.</small>
        )}
      </div>
    );
  }
  return (
    <div className="ed-visit ed-block">
      <b>Block</b>
      {mode === 'new' ? (
        <BlockForm
          start={{ title: '', emoji: '', color: 'teal', note: '' }}
          submit="Start the block"
          busy={busy}
          onSubmit={(f) => {
            const id = newBlockId();
            save([...blockFields(id, f), ...attach(id)]).then((ok) => ok && setMode(''));
          }}
          onCancel={() => setMode('')}
        />
      ) : (
        <div className="ed-row">
          <button className="pill-button small" onClick={() => setMode('new')}>
            Start a block here
          </button>
          {edit.blocks.length > 0 && (
            <button
              className="pill-button small"
              aria-expanded={mode === 'add'}
              onClick={() => setMode(mode === 'add' ? '' : 'add')}
            >
              Add to block ▾
            </button>
          )}
        </div>
      )}
      {mode === 'add' && (
        <div className="ed-moveto" role="menu">
          {edit.blocks.map((b) => (
            <button
              key={b.id}
              role="menuitem"
              disabled={busy}
              onClick={() => save(attach(b.id)).then((ok) => ok && setMode(''))}
            >
              <b>
                {b.emoji} {b.title}
              </b>
              <span>{b.members.length} attached</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
