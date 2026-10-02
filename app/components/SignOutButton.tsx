'use client';

export function SignOutButton() {
  async function signOut() {
    await fetch('/api/auth/sign-out', { method: 'POST' });
    window.location.assign('/sign-in');
  }
  return (
    <button className="link-button" onClick={signOut}>
      Sign out
    </button>
  );
}
