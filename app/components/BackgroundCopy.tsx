'use client';
import { useEffect, useRef, useState } from 'react';

/** The photo copy job this browser drives, kept across page loads. */
const JOB = 'ts_copy_job';
/** Which tab is copying, renewed while it works: two open tabs never copy the same job. */
const LEASE = 'ts_copy_lease';
const LEASE_MS = 15_000;

type Job = { tripId: string; title: string; paused?: boolean };
type State =
  | { kind: 'idle' }
  | { kind: 'copying'; done: number; total: number; perSecond: number | null }
  | { kind: 'paused'; done: number; total: number }
  | { kind: 'done'; total: number; failed: number }
  | { kind: 'expired' }
  | { kind: 'error'; message: string };

const read = <T,>(k: string): T | null => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? 'null') as T | null;
  } catch {
    return null;
  }
};
const write = (k: string, v: unknown) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // Storage unavailable (a private window): copying still runs while this page stays open.
  }
};

/** Starts copying a trip's picked photos in the background (called by the import page). */
export function startBackgroundCopy(tripId: string, title: string) {
  write(JOB, { tripId, title });
  window.dispatchEvent(new Event('ts-copy-job'));
}

const eta = (left: number, perSecond: number | null) => {
  if (!perSecond) return '';
  const min = Math.ceil(left / perSecond / 60);
  return min <= 1 ? ' · about a minute left' : ` · about ${min} min left`;
};

/** Copies picked photos a few at a time while the owner uses any page of the app, with its progress
 *  in a small panel (agreed Oct 3: in the browser for now; on the server at hosting if needed). */
export function BackgroundCopy() {
  const [job, setJob] = useState<Job | null>(null);
  const [state, setState] = useState<State>({ kind: 'idle' });
  // This tab's identity, kept across its page loads (sessionStorage is per tab), so moving to
  // another page carries on at once instead of waiting for its own lease to lapse.
  const tab = useRef('');
  const [retryCount, retry] = useState(0);
  const running = useRef(false);

  useEffect(() => {
    const load = () => setJob(read<Job>(JOB));
    load();
    window.addEventListener('ts-copy-job', load);
    window.addEventListener('storage', load);
    return () => {
      window.removeEventListener('ts-copy-job', load);
      window.removeEventListener('storage', load);
    };
  }, []);

  // A remembered job is checked with the server first: one that no longer copies (applied, discarded,
  // or its data gone) is forgotten quietly, and a paused one shows where it stands.
  const [checked, setChecked] = useState<string | null>(null);
  useEffect(() => {
    if (!job || checked === job.tripId) return;
    let gone = false;
    fetch(`/api/trips/${encodeURIComponent(job.tripId)}/photos/next`)
      .then(async (r) => {
        if (gone) return;
        if (r.ok) {
          const p = (await r.json()) as { total: number; done: number };
          if (job.paused) setState({ kind: 'paused', done: p.done, total: p.total });
          setChecked(job.tripId);
        } else if (r.status === 404) {
          write(JOB, null);
          setJob(null);
          setState({ kind: 'idle' });
        } else setChecked(job.tripId);
      })
      .catch(() => !gone && setChecked(job.tripId));
    return () => {
      gone = true;
    };
  }, [job, checked]);

  useEffect(() => {
    if (!job || job.paused || running.current || checked !== job.tripId) return;
    if (!tab.current) {
      try {
        tab.current = sessionStorage.getItem('ts_tab') ?? Math.random().toString(36).slice(2);
        sessionStorage.setItem('ts_tab', tab.current);
      } catch {
        tab.current = Math.random().toString(36).slice(2);
      }
    }
    const lease = read<{ tab: string; at: number }>(LEASE);
    if (lease && lease.tab !== tab.current && Date.now() - lease.at < LEASE_MS) {
      // Another tab is copying: look again once its lease could have lapsed.
      const t = setTimeout(() => retry((n) => n + 1), LEASE_MS);
      return () => clearTimeout(t);
    }
    running.current = true;
    let stop = false;
    (async () => {
      const started = Date.now();
      let first: number | null = null;
      for (;;) {
        if (stop || read<Job>(JOB)?.paused) break;
        write(LEASE, { tab: tab.current, at: Date.now() });
        const r = await fetch(`/api/trips/${encodeURIComponent(job.tripId)}/photos/next`, {
          method: 'POST',
        }).catch(() => null);
        if (!r) {
          await new Promise((res) => setTimeout(res, 3000)); // offline for a moment: try again
          continue;
        }
        if (r.status === 401) {
          setState({ kind: 'expired' });
          break;
        }
        if (r.status === 404) {
          // Nothing left to copy here (applied or discarded meanwhile): forget the job quietly.
          write(JOB, null);
          setJob(null);
          setState({ kind: 'idle' });
          break;
        }
        if (!r.ok) {
          setState({ kind: 'error', message: await r.text() });
          write(JOB, null);
          break;
        }
        const p = (await r.json()) as {
          total: number;
          done: number;
          failed: number;
          remaining: number;
        };
        first ??= p.done;
        const secs = (Date.now() - started) / 1000;
        if (!p.remaining) {
          setState({ kind: 'done', total: p.total, failed: p.failed });
          write(JOB, null);
          window.dispatchEvent(new Event('ts-copy-done'));
          break;
        }
        setState({
          kind: 'copying',
          done: p.done,
          total: p.total,
          perSecond: secs > 5 ? (p.done - first) / secs : null,
        });
      }
      write(LEASE, null);
      running.current = false;
    })();
    return () => {
      stop = true;
    };
  }, [job, retryCount, checked]);

  if (!job && (state.kind === 'idle' || state.kind === 'copying' || state.kind === 'paused'))
    return null;
  const title = job?.title ?? 'your trip';
  const sources = job ? `/trips/${encodeURIComponent(job.tripId)}/sources` : '/';
  const setPaused = (paused: boolean) => {
    if (!job) return;
    const next = { ...job, paused };
    write(JOB, next);
    setJob(next);
    if (paused && state.kind === 'copying')
      setState({ kind: 'paused', done: state.done, total: state.total });
  };
  return (
    <div className="copy-panel" role="status" aria-live="polite">
      {state.kind === 'done' ? (
        <>
          <span>
            Photos for <b>{title}</b> are copied
            {state.failed ? ` (${state.failed} couldn’t be copied)` : ''}.
          </span>
          <a
            className="pill-button small primary"
            href={sources + '#review-title'}
            onClick={() => setState({ kind: 'idle' })}
          >
            Review them
          </a>
        </>
      ) : state.kind === 'expired' ? (
        <>
          <span>The Google Photos connection for {title} expired.</span>
          <a
            className="pill-button small copper"
            href={`/api/photos/connect?trip=${encodeURIComponent(job!.tripId)}`}
          >
            Connect again
          </a>
        </>
      ) : state.kind === 'error' ? (
        <>
          <span>Copying stopped: {state.message}</span>
          <button className="link-button" onClick={() => setState({ kind: 'idle' })}>
            Close
          </button>
        </>
      ) : (
        <>
          <span className="copy-text">
            Copying photos for <b>{title}</b>
            {state.kind !== 'idle' ? `: ${state.done} of ${state.total}` : '…'}
            {state.kind === 'copying' ? eta(state.total - state.done, state.perSecond) : ''}
            {job?.paused ? ' · paused' : ''}
          </span>
          {state.kind !== 'idle' && (
            <span className="copy-bar" aria-hidden="true">
              <i style={{ width: `${(100 * state.done) / Math.max(1, state.total)}%` }} />
            </span>
          )}
          <button className="link-button" onClick={() => setPaused(!job?.paused)}>
            {job?.paused ? 'Resume' : 'Pause'}
          </button>
        </>
      )}
    </div>
  );
}
