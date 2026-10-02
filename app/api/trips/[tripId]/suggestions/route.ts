import { getStore } from '../../../../../lib/store';
import { actor, editorOnly } from '../../../../../lib/auth/guard';
import { rebuildJournal } from '../../../../../lib/journal';

// Add a suggested stop or journey to the trip, dismiss it, or undo either. These are the owner's
// edits, so they last through every later import.
export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const denied = await editorOnly(req, tripId);
  if (denied) return denied;
  const { key, decision, title } = ((await req.json().catch(() => ({}))) ?? {}) as {
    key?: string;
    decision?: 'add' | 'dismiss' | 'undo';
    title?: string;
  };
  if (!key || !['add', 'dismiss', 'undo'].includes(decision ?? ''))
    return new Response('Missing the suggestion', { status: 400 });
  const store = getStore();
  const by = await actor();
  await Promise.all(
    ['approved', 'dismissed', 'title'].map((f) => store.removeEdit(tripId, 'suggestion', key, f)),
  );
  if (decision === 'add') {
    await store.setEdit(tripId, { target: 'suggestion', key, field: 'approved', value: true, by });
    if (title?.trim())
      await store.setEdit(tripId, {
        target: 'suggestion',
        key,
        field: 'title',
        value: title.trim().slice(0, 120),
        by,
      });
  } else if (decision === 'dismiss')
    await store.setEdit(tripId, { target: 'suggestion', key, field: 'dismissed', value: true, by });
  if (await store.getPlan(tripId)) await rebuildJournal(store, tripId);
  return new Response(null, { status: 204 });
}
