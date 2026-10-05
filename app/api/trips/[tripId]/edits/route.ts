import { getStore } from '../../../../../lib/store';
import { actor, editorOnly } from '../../../../../lib/auth/guard';
import { checkEdit, type EditRequest } from '../../../../../lib/edits';
import { rebuildJournal } from '../../../../../lib/journal';
import { timer } from '../../../../../lib/timing';

/** One request can carry a day's worth ("accept the day's times"), but not unbounded work. */
const MAX_EDITS = 500;

// The owner's edits, several at once: each sets one field, or with no value undoes it. The journal is
// rebuilt once after them, so viewers of a published trip see the change at once (agreed).
export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const t = timer();
  const denied = await editorOnly(req, tripId);
  if (denied) return denied;
  t.mark('auth');
  const { edits } = ((await req.json().catch(() => ({}))) ?? {}) as {
    edits?: Partial<EditRequest>[];
  };
  if (!Array.isArray(edits) || !edits.length || edits.length > MAX_EDITS)
    return new Response('Send between 1 and 500 edits', { status: 400 });
  for (const e of edits) {
    const wrong = checkEdit(e);
    if (wrong) return new Response(wrong, { status: 400 });
  }
  const store = getStore();
  if (!(await store.getPlan(tripId))) return new Response('Import the plan first', { status: 409 });
  const by = await actor();
  // All together (batched), then one rebuild.
  await store.applyEdits(
    tripId,
    (edits as EditRequest[]).map((e) => ({
      target: e.target,
      key: e.key,
      field: e.field,
      value: e.value,
      by,
    })),
  );
  t.mark('save');
  await rebuildJournal(store, tripId);
  t.mark('rebuild');
  return new Response(null, { status: 204, headers: { 'Server-Timing': t.header() } });
}
