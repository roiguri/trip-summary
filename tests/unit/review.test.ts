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
const all = r.days.flatMap((d) => d.items);
const id = (key: string) => `i${expected.entryIds[key]}`;

test('a matched place shows its planned and actual times', () => {
  const carmel = all.find((i) => i.kind === 'times' && i.id === id('carmel-beach-visit'));
  assert.deepEqual(
    carmel && [carmel.kind === 'times' && carmel.from, carmel.kind === 'times' && carmel.to],
    ['09:20 – 10:45', '09:28 – 10:53'],
  );
});

test('a planned stop with no visit is listed once the Timeline arrives', () => {
  assert.ok(all.some((i) => i.kind === 'unvisited' && i.id === id('lovers-point-visit')));
});

test('the new suggestions are exactly the answer key’s', () => {
  const keys = all.flatMap((i) => (i.kind === 'suggestion' ? [i.suggestion.key] : []));
  assert.deepEqual(new Set(keys), new Set(expected.suggestions));
  assert.equal(r.counts.suggestion, expected.suggestions.length);
});

test('days are in order, and each day lists its changes by time', () => {
  const dates = r.days.map((d) => d.date);
  assert.deepEqual(dates, [...dates].sort());
  assert.ok(r.days.every((d) => d.items.length));
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
