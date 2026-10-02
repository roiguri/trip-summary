// Invites and sessions against the Firebase emulators (Firestore and Auth).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getStore } from '../../lib/store/index.ts';
import { createInvite, revokeInvite } from '../../lib/auth/invites.ts';
import { hashSecret, inviteUid } from '../../lib/auth/access.ts';
import { auth, idTokenFor, sessionCookieFor } from '../../lib/auth/tokens.ts';

const store = getStore();

test('an invite stores only the hash of its secret', async () => {
  const { secret, person } = await createInvite(store, 'a-trip', 'Dana', 'owner');
  const stored = await store.getPerson(person.personId);
  assert.equal(stored!.inviteHash, hashSecret(secret));
  assert.ok(!JSON.stringify(stored).includes(secret));
  assert.equal((await store.findPersonByInvite(hashSecret(secret)))!.personId, person.personId);
});

test('of two browsers binding one invite at once, only one wins', async () => {
  const { person } = await createInvite(store, 'a-trip', 'Avi', 'owner');
  const results = await Promise.all(
    ['dev-a', 'dev-b'].map((d) =>
      store.updatePerson(person.personId, { deviceHash: d }, { deviceHash: null }),
    ),
  );
  assert.deepEqual(results.filter(Boolean).length, 1);
});

test('revoking an invite ends the sessions it opened', async () => {
  const { person } = await createInvite(store, 'a-trip', 'Noa', 'owner');
  const uid = inviteUid(person.personId);
  const cookie = await sessionCookieFor(await idTokenFor(await auth().createCustomToken(uid)));
  assert.equal((await auth().verifySessionCookie(cookie, true)).uid, uid);
  // Revocation is recorded to the second: a session from the same second would still pass.
  await new Promise((r) => setTimeout(r, 1100));
  await revokeInvite(store, person.personId);
  await assert.rejects(auth().verifySessionCookie(cookie, true));
  assert.ok((await store.getPerson(person.personId))!.revokedAt);
});

test('revoking a link that was never opened is fine', async () => {
  const { person } = await createInvite(store, 'a-trip', 'Unused', 'owner');
  await revokeInvite(store, person.personId);
  assert.ok((await store.getPerson(person.personId))!.revokedAt);
});

test("a trip's people are found by account and removed with the trip", async () => {
  const { person } = await createInvite(store, 'gone-trip', 'Tal', 'owner');
  await store.updatePerson(person.personId, { uid: 'v_x', email: 'tal@example.com' });
  assert.equal((await store.peopleFor('v_x', null)).length, 1);
  assert.equal((await store.peopleFor('other', 'tal@example.com')).length, 1);
  await store.deleteTrip('gone-trip');
  assert.equal((await store.listPeople('gone-trip')).length, 0);
});
