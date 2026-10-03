// Checks for the routes that change a trip: same-site requests only, from an editor of that trip (or
// the owner, to create one). Each returns a Response to send back, or null to go ahead.
import 'server-only';
import { accessToTrip, canCreateTrips, currentAccount } from './session.ts';
import { sameOrigin } from './same-origin.ts';

export async function editorOnly(req: Request, tripId: string) {
  if (!sameOrigin(req)) return new Response('Forbidden', { status: 403 });
  if (!(await currentAccount())) return new Response('Sign in first', { status: 401 });
  // A trip you can't edit and one that doesn't exist look the same.
  if ((await accessToTrip(tripId))?.access !== 'edit')
    return new Response('Not found', { status: 404 });
  return null;
}

/** The same check for a read that changes nothing (a GET), which browsers send without an Origin
 *  header; another site can't read the answer. */
export async function editorReads(tripId: string) {
  if (!(await currentAccount())) return new Response('Sign in first', { status: 401 });
  if ((await accessToTrip(tripId))?.access !== 'edit')
    return new Response('Not found', { status: 404 });
  return null;
}

export async function ownerOnly(req: Request) {
  if (!sameOrigin(req)) return new Response('Forbidden', { status: 403 });
  if (!(await currentAccount())) return new Response('Sign in first', { status: 401 });
  if (!(await canCreateTrips())) return new Response('Not found', { status: 404 });
  return null;
}

/** Who to record as having done it. */
export const actor = async () => {
  const a = await currentAccount();
  return a?.email ?? a?.uid ?? 'unknown';
};
