'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Picking photos in Google Photos and copying them in (DESIGN.md, "Adding (A3)"): connect once an
 *  hour, pick in Google's own picker, then the picked items are copied a few at a time. */
export function PhotosRow({
  tripId,
  status,
  connected,
  mock,
}: {
  tripId: string;
  status: string | null;
  connected: boolean;
  mock: boolean;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<'idle' | 'picking' | 'copying'>('idle');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const api = `/api/trips/${encodeURIComponent(tripId)}/photos`;
  const post = async (path: string, body: object) => {
    const r = await fetch(api + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  };

  async function copyAll(sessionId: string) {
    setStage('copying');
    for (;;) {
      const r = (await post('/copy', { sessionId })) as {
        total: number;
        done: number;
        remaining: number;
      };
      setProgress({ done: r.done, total: r.total });
      if (!r.remaining) break;
    }
  }

  async function pick(useMock: boolean) {
    setError(null);
    // Opened at once, while the click still counts, so the browser doesn't block it as a pop-up.
    const tab = useMock ? null : window.open('', '_blank');
    try {
      const { sessionId, pickerUri } = (await post('/session', { mock: useMock })) as {
        sessionId: string;
        pickerUri: string;
      };
      if (tab) {
        setStage('picking');
        tab.location.href = pickerUri;
        for (;;) {
          await new Promise((r) => setTimeout(r, 3000));
          if (((await post('/poll', { sessionId })) as { done: boolean }).done) break;
        }
      }
      await copyAll(sessionId);
      router.refresh();
    } catch (e) {
      tab?.close();
      setError(e instanceof Error ? e.message : String(e));
    }
    setStage('idle');
    setProgress(null);
  }

  return (
    <div className={`src-row ${status ? '' : 'todo'}`}>
      <span className="src-icon">{status ? '✓' : '+'}</span>
      <div>
        <b>Photos</b>
        <small>From Google Photos</small>
      </div>
      <small>
        {stage === 'picking'
          ? 'Pick photos in the Google Photos tab, then press Done there.'
          : stage === 'copying'
            ? `Copying ${progress?.done ?? 0} of ${progress?.total ?? '…'}: photos at display and thumbnail size, location removed.`
            : (status ??
              'Pick an album or photos; they’re copied into the journal, videos included.')}
      </small>
      <span className="src-actions">
        {mock && stage === 'idle' && (
          <button className="link-button" onClick={() => pick(true)}>
            Use the mock photos
          </button>
        )}
        {connected ? (
          <button
            className="pill-button small copper"
            disabled={stage !== 'idle'}
            onClick={() => pick(false)}
          >
            {stage === 'idle'
              ? 'Open Google Photos'
              : stage === 'picking'
                ? 'Waiting…'
                : 'Copying…'}
          </button>
        ) : (
          <a
            className="pill-button small copper"
            href={`/api/photos/connect?trip=${encodeURIComponent(tripId)}`}
          >
            Connect Google Photos
          </a>
        )}
      </span>
      {error && (
        <p className="src-error wide" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
