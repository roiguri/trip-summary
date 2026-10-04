// The one Firebase Admin app, shared by the store and sign-in. Against the emulators when their hosts
// are set (development, tests, CI), with the emulator-only demo project; otherwise against the real
// project, with the credentials the host provides.
import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';

export const DEMO_PROJECT = 'demo-trip-summary';

/** True only on the emulators with the demo project: never against a real Firebase project. */
export function emulated() {
  return (
    Boolean(
      process.env.FIRESTORE_EMULATOR_HOST ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST ||
      process.env.FIREBASE_STORAGE_EMULATOR_HOST,
    ) && (process.env.FIREBASE_PROJECT_ID ?? DEMO_PROJECT).startsWith('demo-')
  );
}

/** The server's own service account (docs/ARCHITECTURE.md, "Production"): its email and private key
 *  from the host's secret environment variables; elsewhere the platform's default credentials. */
function credential() {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  return clientEmail && privateKey
    ? cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail, privateKey })
    : applicationDefault();
}

export function adminApp(): App {
  const projectId = process.env.FIREBASE_PROJECT_ID ?? (emulated() ? DEMO_PROJECT : undefined);
  // New projects' default bucket is <project>.firebasestorage.app; set FIREBASE_STORAGE_BUCKET in
  // production rather than rely on the guess.
  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET ?? (projectId && `${projectId}.appspot.com`);
  return (
    getApps()[0] ??
    initializeApp(
      emulated()
        ? { projectId, storageBucket }
        : { credential: credential(), projectId, storageBucket },
    )
  );
}
