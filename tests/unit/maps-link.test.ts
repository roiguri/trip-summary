// Google Maps links: a place at its point, a journey as directions in its travel mode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapsLink } from '../../lib/maps-link.ts';

test('a place links to its point, at Google’s own place when known', () => {
  assert.equal(
    mapsLink({ lat: 25.03, lng: 121.56, placeId: 'ChIJ x' }),
    'https://www.google.com/maps/search/?api=1&query=25.03,121.56&query_place_id=ChIJ%20x',
  );
  assert.equal(mapsLink({ lat: null, lng: 121.56 }), null);
});

test('a journey links to directions from its start to its end, in its travel mode', () => {
  const leg = { kind: 'activity' as const, lat: 25.03, lng: 121.56, endLat: 24.15, endLng: 120.67 };
  assert.equal(
    mapsLink({ ...leg, mode: 'train' }),
    'https://www.google.com/maps/dir/?api=1&origin=25.03,121.56&destination=24.15,120.67&travelmode=transit',
  );
  assert.ok(mapsLink({ ...leg, mode: 'walk' })!.endsWith('&travelmode=walking'));
  assert.ok(!mapsLink({ ...leg, mode: 'flight' })!.includes('travelmode'), 'no mode for a flight');
  assert.ok(
    mapsLink({ ...leg, endLat: null, endLng: null })!.includes('/search/'),
    'without an end, its start',
  );
});
