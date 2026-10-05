'use client';
import { useState } from 'react';
import type { Day, Entry } from '../../../lib/data';
import type { BlockDef, EditData } from '../../../lib/edit-view';
import { BLOCK_COLORS } from '../../../lib/blocks';
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
  const entries = days.flatMap((d) => d.entries);
  const nameOf = (m: BlockDef['members'][number]) => {
    const e =
      m.target === 'entry'
        ? entries.find((x) => x.id === `i${m.key}`)
        : entries.find((x) => edit.added[x.id.slice(1)] === m.key);
    return e
      ? `${e.title || 'An entry'} · ${e.day.slice(5)}${e.time ? ` ${e.time}` : ''}`
      : 'An entry no longer in the plan';
  };
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
      <div className="ed-visit">
        <b>Attached · {block.members.length}</b>
        <small>
          The block runs from its first attached entry to its last; everything between belongs to
          it. Attach more with “Add to block” in an entry’s editor.
        </small>
        {block.members.map((m) => (
          <span key={`${m.target}-${m.key}`} className="bk-member">
            {nameOf(m)}
            <button className="link-button" disabled={busy} onClick={() => save([detach(m)])}>
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
  set,
  save,
  busy,
}: {
  entry: Entry;
  days: Day[];
  edit: EditData;
  set: (field: string, value?: string) => EditChange;
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
          <button
            className="link-button"
            disabled={busy}
            onClick={() => save([set('block', undefined)])}
          >
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
            save([...blockFields(id, f), set('block', id)]).then((ok) => ok && setMode(''));
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
              onClick={() => save([set('block', b.id)]).then((ok) => ok && setMode(''))}
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
