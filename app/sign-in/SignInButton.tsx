'use client';
import { useState } from 'react';
import { initializeApp, getApps } from '@firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithPopup } from '@firebase/auth';

/** Google sign-in in the browser; the server turns the result into a session cookie. */
export function SignInButton({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const app =
        getApps()[0] ??
        initializeApp({
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'emulator',
          // The SDK needs an auth domain even on the emulator; the project's default one stands in.
          authDomain:
            process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??
            `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'demo-trip-summary'}.firebaseapp.com`,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'demo-trip-summary',
        });
      const auth = getAuth(app);
      const emulator = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;
      if (emulator && !(auth as { emulatorConfig?: unknown }).emulatorConfig)
        connectAuthEmulator(auth, `http://${emulator}`, { disableWarnings: true });
      const { user } = await signInWithPopup(auth, new GoogleAuthProvider());
      const r = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: await user.getIdToken() }),
      });
      if (!r.ok) throw new Error(await r.text());
      await auth.signOut(); // the session cookie is the sign-in from here on
      window.location.assign(next);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Sign-in did not finish. Try again.');
      setBusy(false);
    }
  }
  return (
    <>
      <button className="notice-button" onClick={signIn} disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in with Google'}
      </button>
      {error && (
        <p className="notice-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
