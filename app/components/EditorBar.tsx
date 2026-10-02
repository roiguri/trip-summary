'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export type SharedWith = { personId: string; name: string; opened: string | null; google: boolean };

/** The editors' bar on the journey (DESIGN.md, "Trip controls (C1)"): status, sources, a waiting
 *  review, preview as a viewer, publishing, and the people who can see the trip. */
export function EditorBar({
  tripId,
  status,
  waiting,
  people,
}: {
  tripId: string;
  status: 'draft' | 'published';
  waiting: number | null;
  people: SharedWith[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [fresh, setFresh] = useState<{ personId: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/trips/${encodeURIComponent(tripId)}`;
  const post = async (path: string, body: object) => {
    setBusy(true);
    setError(null);
    const r = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!r.ok) {
      setError(await r.text());
      return null;
    }
    router.refresh();
    return r.status === 204 ? {} : r.json();
  };
  const show = (personId: string, link: string) => {
    setFresh({ personId, link });
    setCopied(false);
  };
  async function copy() {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.link);
      setCopied(true);
    } catch {
      setError('Copying didn’t work here: select the link and copy it.');
    }
  }

  return (
    <div className="editor-bar">
      <span className={`trip-status inline ${status}`}>
        {status === 'draft' ? 'DRAFT' : 'PUBLISHED'}
      </span>
      <a className="pill-button small" href={`/trips/${encodeURIComponent(tripId)}/sources`}>
        <span className="long">+ Add sources</span>
        <span className="short">+ Sources</span>
      </a>
      {waiting !== null && (
        <a className="bar-link" href={`/trips/${encodeURIComponent(tripId)}/sources#review-title`}>
          Review waiting{waiting ? <span className="badge">{waiting}</span> : null}
        </a>
      )}
      <span className="bar-space" />
      <a className="pill-button small" href="?view=viewer">
        Preview as a viewer
      </a>
      {status === 'draft' ? (
        <button
          className="pill-button small copper"
          disabled={busy}
          onClick={() => post('/status', { status: 'published' })}
        >
          Publish
        </button>
      ) : (
        <button
          className="pill-button small"
          disabled={busy}
          onClick={() => post('/status', { status: 'draft' })}
        >
          <span className="long">Make it a draft</span>
          <span className="short">Unpublish</span>
        </button>
      )}
      <button
        className="pill-button small primary"
        aria-expanded={open}
        aria-controls="share"
        onClick={() => setOpen(!open)}
      >
        Share · {people.length}
      </button>
      {open && (
        <div className="share" id="share" role="dialog" aria-label="Who can see this trip">
          <h2>Who can see this trip</h2>
          <p>
            Each person gets their own link. Send it however you like; it opens the trip in one
            browser, and you can revoke it.
            {status === 'draft' && ' The trip is a draft: links work once you publish.'}
          </p>
          {people.map((p) => (
            <div className="person" key={p.personId}>
              <span className="avatar" aria-hidden="true">
                {p.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="person-name">
                {p.name}
                <small>
                  {p.google
                    ? 'Signs in with Google'
                    : p.opened
                      ? `Opened ${p.opened}`
                      : 'Not opened yet'}
                </small>
              </span>
              {!p.google && !p.opened && (
                <button
                  className="link-button"
                  disabled={busy}
                  onClick={async () => {
                    const r = (await post(`/people/${p.personId}`, { action: 'renew' })) as {
                      link?: string;
                    } | null;
                    if (r?.link) show(p.personId, r.link);
                  }}
                >
                  New link
                </button>
              )}
              <button
                className="link-button danger"
                disabled={busy}
                onClick={() => post(`/people/${p.personId}`, { action: 'revoke' })}
              >
                Revoke
              </button>
            </div>
          ))}
          {fresh && (
            <div className="fresh-link">
              <small>Their link. It’s shown only now: copy it and send it to them.</small>
              <input
                id="fresh-link"
                readOnly
                value={fresh.link}
                onFocus={(e) => e.target.select()}
              />
              <button className="pill-button small primary" onClick={copy}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
          <form
            className="add-person"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = (await post('/people', { name })) as {
                personId?: string;
                link?: string;
              } | null;
              if (r?.link && r.personId) {
                show(r.personId, r.link);
                setName('');
              }
            }}
          >
            <input
              id="new-person"
              aria-label="Their name"
              placeholder="Name, for example Grandma"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button className="pill-button small primary" disabled={busy || !name.trim()}>
              Create link
            </button>
          </form>
          {error && (
            <p className="src-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
