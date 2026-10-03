'use client';
import type { Day, Entry } from '../../../lib/data';
import type { EditData } from '../../../lib/edit-view';
import { EntryEditor } from './EntryEditor';
import { SuggestionCard } from './SuggestionCard';

/** What edit mode opens in the right column, under the map (DESIGN.md, "Edit mode"): an entry's
 *  editor, or an unplanned stop's card. */
export function EditPanel({
  edit,
  days,
  selected,
  stopKey,
  onClose,
}: {
  edit: EditData;
  days: Day[];
  selected: Entry | null;
  stopKey: string | null;
  onClose: () => void;
}) {
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
