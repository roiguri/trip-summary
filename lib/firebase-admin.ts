// The one Firebase Admin app, shared by the store and sign-in. Against the emulators when their hosts
// are set (development, tests, CI), with the emulator-only demo project; otherwise against the real
// project, with the credentials the host provides.
import { applicationDefault, getApps, initializeApp, type App } from 'firebase-admin/app';

export const DEMO_PROJECT = 'demo-trip-summary';

/** True only on the emulators with the demo project: never against a real Firebase project. */
export function emulated() {
  return (
    Boolean(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) &&
    (process.env.FIREBASE_PROJECT_ID ?? DEMO_PROJECT).startsWith('demo-')
  );
}

export function adminApp(): App {
  return (
    getApps()[0] ??
    initializeApp(
      emulated()
        ? { projectId: process.env.FIREBASE_PROJECT_ID ?? DEMO_PROJECT }
        : { credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID },
    )
  );
}
