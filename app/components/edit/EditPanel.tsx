'use client';
import type { Day, Entry } from '../../../lib/data';
import type { EditData } from '../../../lib/edit-view';
import { EntryEditor } from './EntryEditor';
import { Inbox } from './Inbox';
import { SuggestionCard } from './SuggestionCard';

/** Edit mode's right column (DESIGN.md, "Edit mode"): the inbox, or what was picked from it or the
 *  journey: an entry's editor or an unplanned stop's card. */
export function EditPanel({
  edit,
  days,
  selected,
  stopKey,
  onOpenEntry,
  onOpenStop,
  onClose,
}: {
  edit: EditData;
  days: Day[];
  selected: Entry | null;
  stopKey: string | null;
  onOpenEntry: (id: number) => void;
  onOpenStop: (key: string) => void;
  onClose: () => void;
}) {
  const stop = stopKey
    ? edit.findings.find((f) => f.kind === 'stop' && f.suggestion.key === stopKey)
    : undefined;
  if (stop?.kind === 'stop')
    return (
      <SuggestionCard key={stopKey} finding={stop} days={days} edit={edit} onClose={onClose} />
    );
  if (selected)
    return (
      <EntryEditor key={selected.id} entry={selected} days={days} edit={edit} onClose={onClose} />
    );
  return <Inbox edit={edit} onOpenEntry={onOpenEntry} onOpenStop={onOpenStop} />;
}
