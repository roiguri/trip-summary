// The access rules (lib/auth/access.ts): who may see and edit a trip, and invite-link checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessTo, hashSecret, inviteCheck, newSecret, safeNext } from '../../lib/auth/access.ts';
import type { Person } from '../../lib/store/types.ts';

const OWNER = 'owner@example.com';
const trip = (status: 'draft' | 'published') => ({ tripId: 't1', status });
const person = (p: Partial<Person>): Person => ({
  personId: 'p1',
  tripId: 't1',
  name: 'Dana',
  role: 'viewer',
  email: null,
  uid: null,
  inviteHash: null,
  deviceHash: null,
  createdAt: '',
  createdBy: '',
  lastOpenedAt: null,
  revokedAt: null,
  ...p,
});
const account = (uid: string, email: string | null = null) => ({ uid, email, name: null });

test('the owner edits every trip, drafts included; email case does not matter', () => {
  assert.equal(accessTo(trip('draft'), account('u', 'Owner@Example.com'), [], OWNER), 'edit');
});

test('nobody else sees a trip without a record for it', () => {
  assert.equal(accessTo(trip('published'), account('u', 'someone@example.com'), [], OWNER), null);
  assert.equal(accessTo(trip('published'), account('u', 'owner@example.com'), [], undefined), null);
});

test('an editor is named by email and edits drafts', () => {
  const p = [person({ role: 'editor', email: 'ed@example.com' })];
  assert.equal(accessTo(trip('draft'), account('g1', 'ed@example.com'), p, OWNER), 'edit');
});

test('a viewer sees a trip only once it is published, and never edits it', () => {
  const p = [person({ uid: 'v_p1' })];
  assert.equal(accessTo(trip('draft'), account('v_p1'), p, OWNER), null);
  assert.equal(accessTo(trip('published'), account('v_p1'), p, OWNER), 'view');
});

test("a revoked record gives nothing, and a record for another trip doesn't count", () => {
  assert.equal(
    accessTo(trip('published'), account('v_p1'), [person({ uid: 'v_p1', revokedAt: 'x' })], OWNER),
    null,
  );
  assert.equal(
    accessTo(trip('published'), account('v_p1'), [person({ uid: 'v_p1', tripId: 't2' })], OWNER),
    null,
  );
});

test('an invite opens in the browser that first opened it, and nowhere else', () => {
  assert.equal(inviteCheck(person({}), 'dev-a'), 'ok');
  assert.equal(inviteCheck(person({ deviceHash: 'dev-a' }), 'dev-a'), 'ok');
  assert.equal(inviteCheck(person({ deviceHash: 'dev-a' }), 'dev-b'), 'other-device');
  assert.equal(inviteCheck(person({ revokedAt: 'x' }), 'dev-a'), 'revoked');
  assert.equal(inviteCheck(null, 'dev-a'), 'unknown');
  assert.equal(inviteCheck(person({ role: 'editor' }), 'dev-a'), 'unknown');
});

test('secrets are 256 random bits, and only a one-way hash of them is kept', () => {
  const s = newSecret();
  assert.equal(Buffer.from(s, 'base64url').length, 32);
  assert.notEqual(newSecret(), s);
  assert.match(hashSecret(s), /^[0-9a-f]{64}$/);
  assert.ok(!hashSecret(s).includes(s));
});

test('a redirect after sign-in stays on this site', () => {
  assert.equal(safeNext('/trips/t1'), '/trips/t1');
  for (const bad of [
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '',
    null,
    undefined,
  ])
    assert.equal(safeNext(bad), '/');
});
