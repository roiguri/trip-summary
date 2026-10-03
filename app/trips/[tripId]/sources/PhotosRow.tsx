'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { startBackgroundCopy } from '../../../components/BackgroundCopy';

/** Picking photos in Google Photos (DESIGN.md, "Adding (A3)"): connect once an hour, pick in Google's
 *  own picker; the picked items then copy in the background while you carry on (agreed Oct 3). */
export function PhotosRow({
  tripId,
  title,
  status,
  copying,
  connected,
  mock,
}: {
  tripId: string;
  title: string;
  status: string | null;
  copying: boolean;
  connected: boolean;
  mock: boolean;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<'idle' | 'picking' | 'starting'>('idle');
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
      setStage('starting');
      await post('/start', { sessionId });
      startBackgroundCopy(tripId, title);
      router.refresh();
    } catch (e) {
      tab?.close();
      setError(e instanceof Error ? e.message : String(e));
    }
    setStage('idle');
  }

  const busy = stage !== 'idle' || copying;
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
          : stage === 'starting'
            ? 'Getting the list of picked photos…'
            : copying
              ? 'Copying in the background: you can carry on, its progress shows at the bottom of every page.'
              : (status ??
                'Pick an album or photos; they’re copied into the journal, videos included.')}
      </small>
      <span className="src-actions">
        {mock && !busy && (
          <button className="link-button" onClick={() => pick(true)}>
            Use the mock photos
          </button>
        )}
        {connected ? (
          <button className="pill-button small copper" disabled={busy} onClick={() => pick(false)}>
            {stage === 'picking' ? 'Waiting…' : copying ? 'Copying…' : 'Open Google Photos'}
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
