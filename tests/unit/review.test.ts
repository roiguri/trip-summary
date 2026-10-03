// The import review (lib/review.ts) on the mocks: the plan alone, then with its Timeline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { merge } from '../../lib/merge/index.ts';
import { readJarvisPlan } from '../../lib/import/plan.ts';
import { sliceTimeline } from '../../lib/import/timeline.ts';
import { review } from '../../lib/review.ts';
import { jarvisFile } from '../helpers.ts';

const expected = JSON.parse(readFileSync('data/mock/expected.json', 'utf8'));
const plan = { ...readJarvisPlan(jarvisFile(), expected.trip), importedAt: '' };
const segments = sliceTimeline(JSON.parse(readFileSync('data/mock/Timeline.json', 'utf8')), {
  startDate: '2026-05-15',
  endDate: '2026-05-20',
  timezone: 'America/Los_Angeles',
});
const before = merge({ plan, segments: [], photos: [], edits: [] });
const after = merge({ plan, segments, photos: [], edits: [] });
const r = review(before, after);

test('a Timeline import changes nothing to review: what it found is for edit mode', () => {
  assert.equal(r.days.length, 0);
});

test('reviewing the same sources twice finds nothing', () => {
  assert.equal(review(after, after).days.length, 0);
});

test('a plan update lists what it added, removed and renamed', () => {
  const lunch = expected.entryIds['lunch'];
  const changed = {
    ...plan,
    itinerary: [
      ...plan.itinerary
        .filter((x) => x.entry_id !== expected.entryIds['quiet-note'])
        .map((x) => (x.entry_id === lunch ? { ...x, title: 'Lunch by the sea' } : x)),
      {
        ...plan.itinerary.find((x) => x.item_type === 'note')!,
        entry_id: 999,
        title: 'A new note',
        start_date: '2026-05-17',
        start_time: '18:00',
      },
    ],
  };
  const r2 = review(after, merge({ plan: changed, segments, photos: [], edits: [] }));
  const kinds = r2.days.flatMap((d) => d.items.map((i) => i.kind));
  for (const k of ['added', 'removed', 'retitled']) assert.ok(kinds.includes(k as never), k);
});
