// The media helpers: the EXIF offset, the sealed Google token, and media paths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { exifOffset } from '../../lib/media/exif.ts';
import { openToken, seal, sealToken, unseal } from '../../lib/google/token-cookie.ts';
import { mediaPath, mediaUrl, tripOfPath } from '../../lib/media/paths.ts';

const jpeg = (exif?: object) => {
  const img = sharp({ create: { width: 16, height: 16, channels: 3, background: '#7a9' } }).jpeg();
  return (exif ? img.withExif(exif as never) : img).toBuffer();
};

test('the local offset is read from EXIF OffsetTimeOriginal, in minutes east of UTC', async () => {
  assert.equal(exifOffset(await jpeg({ IFD2: { OffsetTimeOriginal: '-07:00' } })), -420);
  assert.equal(exifOffset(await jpeg({ IFD2: { OffsetTimeOriginal: '+05:30' } })), 330);
  assert.equal(exifOffset(await jpeg({ IFD0: { Make: 'No offset here' } })), null);
  assert.equal(exifOffset(await jpeg()), null);
  assert.equal(exifOffset(Buffer.from('not a jpeg')), null);
});

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
