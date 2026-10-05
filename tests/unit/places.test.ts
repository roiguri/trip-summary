// Place names: looked up once per place ID and cached; failures not cached; no key, no lookups.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeNames, type NameLookup } from '../../lib/google/places.ts';
import type { Store } from '../../lib/store/index.ts';

const memoryStore = () => {
  const cache = new Map<string, string | null>();
  return {
    cache,
    store: {
      async getPlaceNames(ids: string[]) {
        return new Map(ids.filter((id) => cache.has(id)).map((id) => [id, cache.get(id)!]));
      },
      async putPlaceNames(names: Map<string, string | null>) {
        for (const [k, v] of names) cache.set(k, v);
      },
    } as unknown as Store,
  };
};

test('names are looked up once, then come from the cache', async () => {
  const { store, cache } = memoryStore();
  const asked: string[] = [];
  const lookup: NameLookup = async (id) => (asked.push(id), id === 'gone' ? null : `Name of ${id}`);
  const first = await placeNames(store, ['a', 'b', 'a', 'gone'], lookup);
  assert.deepEqual(
    [...first],
    [
      ['a', 'Name of a'],
      ['b', 'Name of b'],
    ],
  );
  assert.deepEqual(asked.sort(), ['a', 'b', 'gone']);
  assert.equal(cache.get('gone'), null, 'no name is remembered too');
  const again = await placeNames(store, ['a', 'b', 'gone'], lookup);
  assert.equal(again.get('a'), 'Name of a');
  assert.equal(asked.length, 3, 'nothing looked up the second time');
});

test('a failed lookup is not cached, and without a key nothing is looked up', async () => {
  const { store, cache } = memoryStore();
  const failing: NameLookup = async () => {
    throw new Error('Google Places answered 429');
  };
  assert.equal((await placeNames(store, ['x'], failing)).size, 0);
  assert.equal(cache.has('x'), false);
  assert.equal((await placeNames(store, ['x'], null)).size, 0);
});

test('a view looks up at most a few dozen names; the rest wait', async () => {
  const { store } = memoryStore();
  let n = 0;
  const lookup: NameLookup = async (id) => (n++, id);
  await placeNames(
    store,
    Array.from({ length: 100 }, (_, i) => `p${i}`),
    lookup,
    60,
  );
  assert.equal(n, 60);
});
