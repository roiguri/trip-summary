'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Updating the plan from a newer Jarvis database: it waits for review below. */
export function PlanRow({ tripId, status }: { tripId: string; status: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.append('file', file);
    const r = await fetch(`/api/trips/${encodeURIComponent(tripId)}/plan`, {
      method: 'POST',
      body,
    });
    setBusy(false);
    if (!r.ok) return setError(await r.text());
    router.refresh();
  }
  return (
    <div className="src-row">
      <span className="src-icon">✓</span>
      <div>
        <b>Plan</b>
        <small>From Jarvis</small>
      </div>
      <small>{status}</small>
      <label className="pill-button small">
        <input
          type="file"
          id="plan-file"
          className="visually-hidden"
          accept=".sqlite,.db,.sqlite3"
          disabled={busy}
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        {busy ? 'Reading…' : 'Update from a newer file'}
      </label>
      {error && (
        <p className="src-error wide" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
