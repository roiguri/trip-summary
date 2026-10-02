'use client';
import { useState } from 'react';

type JarvisTrip = {
  tripId: string;
  title: string | null;
  destination: string;
  startDate: string | null;
  endDate: string | null;
  entries: number;
  isCurrent: boolean;
  added: boolean;
};

/** A new trip: choose the Jarvis database file, pick the trip; it becomes a draft. */
export function NewTripForm() {
  const [file, setFile] = useState<File | null>(null);
  const [trips, setTrips] = useState<JarvisTrip[] | null>(null);
  const [picked, setPicked] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function read(f: File) {
    setFile(f);
    setTrips(null);
    setError(null);
    setBusy(true);
    const body = new FormData();
    body.append('file', f);
    const r = await fetch('/api/jarvis/trips', { method: 'POST', body });
    setBusy(false);
    if (!r.ok) return setError(await r.text());
    const list = (await r.json()) as JarvisTrip[];
    setTrips(list);
    setPicked(list.find((t) => !t.added)?.tripId ?? '');
  }

  async function create() {
    if (!file || !picked) return;
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.append('file', file);
    body.append('tripId', picked);
    const r = await fetch('/api/trips', { method: 'POST', body });
    if (!r.ok) {
      setBusy(false);
      return setError(await r.text());
    }
    window.location.assign(`/trips/${encodeURIComponent(picked)}/sources`);
  }

  return (
    <div className="src-rows">
      <div className={`src-row ${trips ? '' : 'todo'}`}>
        <span className="src-icon">{trips ? '✓' : '1'}</span>
        <div>
          <b>Plan</b>
          <small>From Jarvis</small>
        </div>
        <label className="src-drop">
          <input
            type="file"
            id="jarvis-file"
            accept=".sqlite,.db,.sqlite3,application/x-sqlite3,application/vnd.sqlite3"
            onChange={(e) => e.target.files?.[0] && read(e.target.files[0])}
          />
          <b>{file ? file.name : 'Choose your Jarvis database file'}</b>
          {file ? ` · ${Math.round(file.size / 1024)} KB` : ' · travel.sqlite'}
        </label>
      </div>
      {busy && !trips && <p className="src-note">Reading the file…</p>}
      {trips && (
        <fieldset className="pick-trip">
          <legend>Which trip?</legend>
          {trips.map((t) => (
            <label key={t.tripId} className={t.added ? 'added' : ''}>
              <input
                type="radio"
                name="trip"
                value={t.tripId}
                checked={picked === t.tripId}
                disabled={t.added}
                onChange={() => setPicked(t.tripId)}
              />
              <span>
                <b>{t.title ?? t.destination}</b>
                <small>
                  {t.startDate ? `${t.startDate} → ${t.endDate}` : 'No dates yet'} · {t.entries}{' '}
                  {t.entries === 1 ? 'entry' : 'entries'}
                  {t.isCurrent ? ' · current in Jarvis' : ''}
                  {t.added ? ' · already in your journeys' : ''}
                </small>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {error && (
        <p className="src-error" role="alert">
          {error}
        </p>
      )}
      {trips && (
        <div className="src-run">
          <span>It becomes a draft only editors can see. The Timeline and photos come next.</span>
          <button className="pill-button copper" onClick={create} disabled={!picked || busy}>
            {busy ? 'Creating…' : 'Create the draft'}
          </button>
        </div>
      )}
    </div>
  );
}
