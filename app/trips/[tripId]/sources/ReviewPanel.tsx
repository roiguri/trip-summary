'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Review, ReviewItem } from '../../../../lib/review';

const MODE: Record<string, string> = {
  car: 'car',
  train: 'train',
  flight: 'flight',
  bus: 'bus',
  ferry: 'ferry',
  walk: 'on foot',
  bike: 'bike',
};
const day = (date: string) =>
  new Date(`${date}T12:00:00Z`)
    .toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    })
    .toUpperCase();

/** The review of the waiting import (DESIGN.md, "Review (R3)"): its changes day by day, the new
 *  suggestions to add or dismiss, then Apply or Discard. */
export function ReviewPanel({
  tripId,
  source,
  review,
  decisions,
  published,
}: {
  tripId: string;
  source: 'plan' | 'timeline' | 'photos';
  review: Review;
  decisions: Record<string, 'add' | 'dismiss'>;
  published: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const post = async (path: string, body: object, tag: string) => {
    setBusy(tag);
    setError(null);
    const r = await fetch(`/api/trips/${encodeURIComponent(tripId)}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(null);
    if (!r.ok) return setError(await r.text());
    router.refresh();
  };
  const c = review.counts;
  const tally = [
    c.times && `${c.times} ${c.times === 1 ? 'time' : 'times'} updated`,
    c.mode && `${c.mode} travel ${c.mode === 1 ? 'mode' : 'modes'}`,
    c.added && `${c.added} added`,
    c.removed && `${c.removed} removed`,
    c.retitled + c.notes && `${c.retitled + c.notes} renamed or rewritten`,
    c.suggestion && `${c.suggestion} ${c.suggestion === 1 ? 'suggestion' : 'suggestions'}`,
    c.unvisited && `${c.unvisited} not visited`,
    c.photos && `${c.photos} ${c.photos === 1 ? 'photo' : 'photos'}`,
  ].filter(Boolean);

  const line = (item: ReviewItem) => {
    switch (item.kind) {
      case 'times':
        return [
          item.title,
          <>
            <span className="was">{item.from}</span> → <b>{item.to}</b>
          </>,
        ];
      case 'mode':
        return [
          item.title,
          <>
            travel mode: <b>{MODE[item.mode] ?? item.mode}</b>, from the Timeline
          </>,
        ];
      case 'unvisited':
        return [item.title, <>no visit found · keeps {item.time}</>];
      case 'added':
        return [item.title, <b>new in the plan</b>];
      case 'removed':
        return [<s key="t">{item.title}</s>, <>no longer in the plan</>];
      case 'retitled':
        return [item.to, <>was “{item.from}”</>];
      case 'notes':
        return [item.title, <>note rewritten</>];
      default:
        return null;
    }
  };

  return (
    <section className="review" aria-labelledby="review-title">
      <h2 id="review-title">
        What this{' '}
        {source === 'plan'
          ? 'plan update'
          : source === 'timeline'
            ? 'Timeline import'
            : 'photo import'}{' '}
        changes <span>{tally.join(' · ') || 'No changes to the journey'}</span>
      </h2>
      {review.days.map((d) => (
        <div className="review-day" key={d.date}>
          <b>{day(d.date)}</b>
          <div>
            {d.items.map((item, i) => {
              if (item.kind === 'photos')
                return (
                  <div className="review-item review-photos" key={i}>
                    <span>{item.where ?? 'Loose moments'}</span>
                    <span>
                      {item.thumbs.map((p) => (
                        // eslint-disable-next-line @next/next/no-img-element -- stored media, served as is
                        <img key={p.id} src={p.url} alt="" />
                      ))}
                      <b>
                        {item.count} new {item.count === 1 ? 'photo' : 'photos'}
                      </b>
                    </span>
                  </div>
                );
              if (item.kind !== 'suggestion') {
                const [title, what] = line(item)!;
                return (
                  <div className="review-item" key={i}>
                    <span>{title}</span>
                    <span>{what}</span>
                  </div>
                );
              }
              const s = item.suggestion;
              const decided = decisions[s.key];
              return (
                <div className={`suggestion ${decided ?? ''}`} key={s.key}>
                  {item.photos[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- stored media, served as is
                    <img src={item.photos[0].url} alt="" />
                  ) : (
                    <span className="suggestion-blank" aria-hidden="true" />
                  )}
                  <div>
                    <small>
                      {s.kind === 'visit' ? 'SUGGESTED STOP' : 'SUGGESTED JOURNEY'} · {s.time} –{' '}
                      {s.endTime}
                      {item.photos.length
                        ? ` · ${item.photos.length} ${item.photos.length === 1 ? 'PHOTO' : 'PHOTOS'}`
                        : ''}
                    </small>
                    {decided ? (
                      <strong>{decided === 'add' ? 'Added to the journey' : 'Dismissed'}</strong>
                    ) : (
                      <input
                        id={`name-${s.key}`}
                        aria-label="Name it (optional)"
                        placeholder={
                          s.kind === 'visit'
                            ? 'Name this stop (optional)'
                            : `A journey by ${MODE[s.mode ?? ''] ?? 'road'} (optional name)`
                        }
                        value={names[s.key] ?? ''}
                        onChange={(e) => setNames({ ...names, [s.key]: e.target.value })}
                      />
                    )}
                  </div>
                  <span className="src-actions">
                    {decided ? (
                      <button
                        className="link-button"
                        disabled={!!busy}
                        onClick={() => post('suggestions', { key: s.key, decision: 'undo' }, s.key)}
                      >
                        Undo
                      </button>
                    ) : (
                      <>
                        <button
                          className="pill-button small primary"
                          disabled={!!busy}
                          onClick={() =>
                            post(
                              'suggestions',
                              { key: s.key, decision: 'add', title: names[s.key] },
                              s.key,
                            )
                          }
                        >
                          Add
                        </button>
                        <button
                          className="pill-button small"
                          disabled={!!busy}
                          onClick={() =>
                            post('suggestions', { key: s.key, decision: 'dismiss' }, s.key)
                          }
                        >
                          Dismiss
                        </button>
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {error && (
        <p className="src-error" role="alert">
          {error}
        </p>
      )}
      <div className="src-run">
        <span>
          {published
            ? 'Applying updates the published trip at once.'
            : 'Applying updates the draft. Nobody else sees it until you publish.'}
        </span>
        <span className="src-actions">
          <button
            className="pill-button small"
            disabled={!!busy}
            onClick={() => post('pending', { action: 'discard' }, 'discard')}
          >
            Discard
          </button>
          <button
            className="pill-button small primary"
            disabled={!!busy}
            onClick={() => post('pending', { action: 'apply' }, 'apply')}
          >
            {busy === 'apply' ? 'Applying…' : 'Apply'}
          </button>
        </span>
      </div>
    </section>
  );
}
