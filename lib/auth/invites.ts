// Creating and revoking viewers' invite links (docs/ARCHITECTURE.md, "Sign-in and access").
import { randomUUID } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { adminApp } from '../firebase-admin.ts';
import type { Store } from '../store/index.ts';
import type { Person } from '../store/types.ts';
import { hashSecret, inviteUid, newSecret } from './access.ts';

/** A new viewer with a personal link. The secret is returned once, to be put in the link; only its
 *  hash is stored. */
export async function createInvite(store: Store, tripId: string, name: string, by: string) {
  const secret = newSecret();
  const personId = randomUUID();
  const person: Person = {
    personId,
    tripId,
    name,
    role: 'viewer',
    email: null,
    uid: null,
    inviteHash: hashSecret(secret),
    deviceHash: null,
    createdAt: new Date().toISOString(),
    createdBy: by,
    lastOpenedAt: null,
    revokedAt: null,
  };
  await store.putPerson(person);
  return { secret, person };
}

/** Revokes a viewer: their link stops working and every session it opened ends now. */
export async function revokeInvite(store: Store, personId: string) {
  await store.updatePerson(personId, { revokedAt: new Date().toISOString() });
  try {
    await getAuth(adminApp()).revokeRefreshTokens(inviteUid(personId));
  } catch (e) {
    // A link that was never opened has no account to revoke.
    if ((e as { code?: string }).code !== 'auth/user-not-found') throw e;
  }
}

/** A fresh link for a viewer whose first link was lost or never opened: the old link stops working,
 *  its sessions end, and the new one binds to whichever browser opens it first. */
export async function renewInvite(store: Store, personId: string) {
  const secret = newSecret();
  await store.updatePerson(personId, {
    inviteHash: hashSecret(secret),
    deviceHash: null,
    revokedAt: null,
  });
  try {
    await getAuth(adminApp()).revokeRefreshTokens(inviteUid(personId));
  } catch (e) {
    if ((e as { code?: string }).code !== 'auth/user-not-found') throw e;
  }
  return secret;
}

/** The mock viewer of a trip, for development and the tests: one fixed person per trip, signed in
 *  directly (no link), so the visual tests always see the same viewers. */
export async function mockViewer(store: Store, tripId: string) {
  const personId = `dev-viewer-${tripId}`;
  if (!(await store.getPerson(personId)))
    await store.putPerson({
      personId,
      tripId,
      name: 'Mock viewer',
      role: 'viewer',
      email: null,
      uid: inviteUid(personId),
      inviteHash: null,
      deviceHash: null,
      createdAt: new Date(0).toISOString(),
      createdBy: 'dev',
      lastOpenedAt: null,
      revokedAt: null,
    });
  return personId;
}
