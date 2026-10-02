'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { sliceTimeline } from '../../../../lib/import/timeline';
import type { TimelineSegment } from '../../../../lib/store/types';

type Window = { startDate: string | null; endDate: string | null; timezone: string };
const size = (n: number) =>
  n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${Math.round(n / 1048576)} MB`;
/** "May 14–21", or "May 30 – Jun 2" across months. */
function range(a: string, b: string) {
  const f = (d: string, o: Intl.DateTimeFormatOptions) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { ...o, timeZone: 'UTC' });
  const md = { month: 'short', day: 'numeric' } as const;
  return a.slice(0, 7) === b.slice(0, 7)
    ? `${f(a, md)}–${f(b, { day: 'numeric' })}`
    : `${f(a, md)} – ${f(b, md)}`;
}
const shift = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The Timeline export is read and sliced here, in the browser: only the trip's days are uploaded. */
export function TimelineRow({
  tripId,
  trip,
  status,
}: {
  tripId: string;
  trip: Window;
  status: string | null;
}) {
  const router = useRouter();
  const [slice, setSlice] = useState<{
    name: string;
    size: number;
    segments: TimelineSegment[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function read(file: File) {
    setError(null);
    setSlice(null);
    setBusy(true);
    try {
      const segments = sliceTimeline(JSON.parse(await file.text()), trip);
      setSlice({ name: file.name, size: file.size, segments });
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? 'That file is not a Timeline export (it isn’t JSON).'
          : e instanceof Error
            ? e.message
            : String(e),
      );
    }
    setBusy(false);
  }
  async function upload() {
    if (!slice) return;
    setBusy(true);
    const r = await fetch(`/api/trips/${encodeURIComponent(tripId)}/timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ segments: slice.segments }),
    });
    setBusy(false);
    if (!r.ok) return setError(await r.text());
    setSlice(null);
    router.refresh();
  }

  const days =
    trip.startDate && trip.endDate
      ? range(shift(trip.startDate, -1), shift(trip.endDate, 1))
      : null;
  return (
    <div className={`src-row ${status ? '' : 'todo'}`}>
      <span className="src-icon">{status ? '✓' : '+'}</span>
      <div>
        <b>Timeline</b>
        <small>Actual times, how you travelled</small>
      </div>
      {slice ? (
        <small className="src-slice">
          <b>{slice.name}</b> · {size(slice.size)} read on this computer. Only {days} will be
          uploaded: {slice.segments.length} visits and journeys,{' '}
          {size(new Blob([JSON.stringify(slice.segments)]).size)}.
        </small>
      ) : (
        <label className="src-drop">
          <input
            type="file"
            id="timeline-file"
            accept=".json,application/json"
            disabled={busy || !days}
            onChange={(e) => e.target.files?.[0] && read(e.target.files[0])}
          />
          {days ? (
            <>
              <b>{busy ? 'Reading…' : 'Choose Timeline.json'}</b> · read on this computer; only{' '}
              {days} is uploaded{status ? ` · ${status}` : ''}
            </>
          ) : (
            'The trip needs dates in Jarvis before a Timeline can be added'
          )}
        </label>
      )}
      {slice ? (
        <span className="src-actions">
          <button className="link-button" onClick={() => setSlice(null)}>
            Cancel
          </button>
          <button className="pill-button small copper" onClick={upload} disabled={busy}>
            {busy ? 'Uploading…' : 'Upload the trip’s days'}
          </button>
        </span>
      ) : (
        <span />
      )}
      {error && (
        <p className="src-error wide" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
