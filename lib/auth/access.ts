// Who may see and edit a trip (docs/DATA-DESIGN.md, "Access"; docs/ARCHITECTURE.md, "Sign-in and
// access"). Pure, so the rules are tested on their own; lib/auth/session.ts supplies the facts.
import { createHash, randomBytes } from 'node:crypto';
import type { Person, Trip } from '../store/types.ts';

export type Account = { uid: string; email: string | null; name: string | null };
export type Access = 'edit' | 'view';

/** A new invite link's secret: 256 random bits. Only its hash is ever stored. */
export const newSecret = () => randomBytes(32).toString('base64url');
export const hashSecret = (secret: string) => createHash('sha256').update(secret).digest('hex');

/** The UID an invite link signs its viewer in as. */
export const inviteUid = (personId: string) => `v_${personId}`;

/** The owner (by email, from the server's settings) edits every trip and creates new ones. */
export const isOwner = (a: Account, ownerEmail: string | undefined) =>
  !!ownerEmail && !!a.email && a.email.toLowerCase() === ownerEmail.toLowerCase();

/** What an account may do with a trip, given the people records that name it. Viewers see a trip
 *  only once it is published; a revoked record gives nothing. */
export function accessTo(
  trip: Pick<Trip, 'tripId' | 'status'>,
  account: Account,
  people: Person[],
  ownerEmail: string | undefined,
): Access | null {
  if (isOwner(account, ownerEmail)) return 'edit';
  const mine = people.filter(
    (p) =>
      p.tripId === trip.tripId &&
      !p.revokedAt &&
      (p.uid === account.uid ||
        (!!p.email && !!account.email && p.email.toLowerCase() === account.email.toLowerCase())),
  );
  if (mine.some((p) => p.role === 'editor')) return 'edit';
  if (trip.status === 'published' && mine.some((p) => p.role === 'viewer')) return 'view';
  return null;
}

/** An invite link may be opened by this browser: it exists, isn't revoked, and is either unused or
 *  already bound to this same browser. */
export function inviteCheck(person: Person | null, deviceHash: string) {
  if (!person || person.role !== 'viewer') return 'unknown' as const;
  if (person.revokedAt) return 'revoked' as const;
  if (person.deviceHash && person.deviceHash !== deviceHash) return 'other-device' as const;
  return 'ok' as const;
}

/** A redirect target from a query string: only a path on this site, never another origin. */
export function safeNext(next: string | null | undefined, fallback = '/') {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')
    ? next
    : fallback;
}
