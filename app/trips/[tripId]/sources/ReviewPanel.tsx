'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Review, ReviewItem } from '../../../../lib/review';

const day = (date: string) =>
  new Date(`${date}T12:00:00Z`)
    .toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    })
    .toUpperCase();
const NAMES = { plan: 'plan update', timeline: 'Timeline import', photos: 'photo import' } as const;

/** The review of one waiting import (DESIGN.md, "Review (R3)"): what it changes in the trip, day by
 *  day, then Apply or Discard. What the Timeline found is for edit mode, not here (decided Oct 3). */
export function ReviewPanel({
  tripId,
  source,
  review,
  published,
}: {
  tripId: string;
  source: 'plan' | 'timeline' | 'photos';
  review: Review;
  published: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const decide = async (action: 'apply' | 'discard') => {
    setBusy(action);
    setError(null);
    const r = await fetch(`/api/trips/${encodeURIComponent(tripId)}/pending`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, source }),
    });
    setBusy(null);
    if (!r.ok) return setError(await r.text());
    router.refresh();
  };
  const c = review.counts;
  const tally = [
    c.times && `${c.times} ${c.times === 1 ? 'time' : 'times'} updated`,
    c.added && `${c.added} added`,
    c.removed && `${c.removed} removed`,
    c.retitled + c.notes && `${c.retitled + c.notes} renamed or rewritten`,
    c.photos && `${c.photos} ${c.photos === 1 ? 'photo' : 'photos'}`,
  ].filter(Boolean);

  const line = (item: Exclude<ReviewItem, { kind: 'photos' }>) => {
    switch (item.kind) {
      case 'times':
        return [
          item.title,
          <>
            <span className="was">{item.from}</span> → <b>{item.to}</b>
          </>,
        ];
      case 'added':
        return [item.title, <b>new in the plan</b>];
      case 'removed':
        return [<s key="t">{item.title}</s>, <>no longer in the plan</>];
      case 'retitled':
        return [item.to, <>was “{item.from}”</>];
      case 'notes':
        return [item.title, <>note rewritten</>];
    }
  };

  return (
    <section className="review" aria-labelledby={`review-${source}`}>
      <h2 id={`review-${source}`}>
        What this {NAMES[source]} changes{' '}
        <span>{tally.join(' · ') || 'No changes to the journey'}</span>
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
              const [title, what] = line(item);
              return (
                <div className="review-item" key={i}>
                  <span>{title}</span>
                  <span>{what}</span>
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
          <button className="pill-button small" disabled={!!busy} onClick={() => decide('discard')}>
            Discard
          </button>
          <button
            className="pill-button small primary"
            disabled={!!busy}
            onClick={() => decide('apply')}
          >
            {busy === 'apply' ? 'Applying…' : 'Apply'}
          </button>
        </span>
      </div>
    </section>
  );
}
