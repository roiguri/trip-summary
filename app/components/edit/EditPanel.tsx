'use client';
import type { Day, Entry } from '../../../lib/data';
import type { EditData } from '../../../lib/edit-view';
import { BlockEditor } from './BlockEditor';
import { EntryEditor } from './EntryEditor';
import { SuggestionCard } from './SuggestionCard';

/** What edit mode opens in the right column, under the map (DESIGN.md, "Edit mode"): an entry's
 *  editor, an unplanned stop's card, or a block's editor. */
export function EditPanel({
  edit,
  days,
  selected,
  stopKey,
  blockKey,
  onClose,
}: {
  edit: EditData;
  days: Day[];
  selected: Entry | null;
  stopKey: string | null;
  blockKey: string | null;
  onClose: () => void;
}) {
  const block = blockKey ? edit.blocks.find((b) => b.id === blockKey) : undefined;
  if (block)
    return <BlockEditor key={block.id} block={block} days={days} edit={edit} onClose={onClose} />;
  const stop = stopKey
    ? [...edit.findings, ...edit.setAside].find(
        (f) => f.kind === 'stop' && f.suggestion.key === stopKey,
      )
    : undefined;
  if (stop?.kind === 'stop')
    return (
      <SuggestionCard key={stopKey} finding={stop} days={days} edit={edit} onClose={onClose} />
    );
  if (selected)
    return (
      <EntryEditor key={selected.id} entry={selected} days={days} edit={edit} onClose={onClose} />
    );
  return null;
}
