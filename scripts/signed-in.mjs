// The checks open the sample trip signed in as the mock editor (/api/auth/dev, which exists only on
// the Firebase emulators with the demo project).
export const TRIP = process.env.TRIP_PATH || '/trips/sample-coast';

const done = new WeakMap();
/** Signs a browser context in (once per app origin). */
export async function signIn(context, base) {
  const seen = done.get(context) ?? new Set();
  if (seen.has(base)) return;
  const p = await context.newPage();
  const r = await p.goto(`${base}/api/auth/dev?as=editor&next=/invite/problem`);
  if (!r?.ok()) throw new Error(`Mock sign-in failed at ${base} (is the app on the emulators?)`);
  await p.close();
  seen.add(base);
  done.set(context, seen);
}
