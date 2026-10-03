// The media helpers: the sealed Google token and media paths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { openToken, seal, sealToken, unseal } from '../../lib/google/token-cookie.ts';
import { mediaPath, mediaUrl, tripOfPath } from '../../lib/media/paths.ts';

const K = createHash('sha256').update('test key').digest();
const OTHER = createHash('sha256').update('other key').digest();

test('a sealed token opens only with its key, unaltered, before it expires', () => {
  const sealed = sealToken('ya29.secret', Date.now() + 60_000, K);
  assert.ok(!sealed.includes('ya29'), 'the token is not readable in the cookie');
  assert.equal(openToken(sealed, K), 'ya29.secret');
  assert.equal(openToken(sealed, OTHER), null);
  const flipped = Buffer.from(sealed, 'base64url');
  flipped[flipped.length - 1] ^= 1;
  assert.equal(openToken(flipped.toString('base64url'), K), null);
  assert.equal(openToken(sealed, K, Date.now() + 120_000), null);
  assert.equal(openToken(undefined, K), null);
});

test('a sealed value round-trips', () => {
  assert.deepEqual(unseal(seal({ state: 's', trip: 't' }, Date.now() + 60_000, K), K), {
    state: 's',
    trip: 't',
  });
});

test('media paths name their trip; web paths stay as they are', () => {
  const p = mediaPath('trip-1', 'media-1', 'display');
  assert.equal(tripOfPath(p), 'trip-1');
  assert.equal(mediaUrl(p), '/media/trips/trip-1/media/media-1/display.jpg');
  assert.equal(mediaUrl('/photos/coast-1.jpg'), '/photos/coast-1.jpg');
  for (const bad of [
    'trips/t/media/m/../../x',
    'trips/t/other/m/display.jpg',
    'secrets.txt',
    'trips/t/media/m/display.png',
  ])
    assert.equal(tripOfPath(bad), null, bad);
});
