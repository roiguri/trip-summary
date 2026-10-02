import type { ReactNode } from 'react';

/** The bar above a trip's pages for editors: the mark, where you are, and the trip's status. */
export function TripHeader({
  crumbs,
  status,
  right,
}: {
  crumbs: { label: string; href?: string }[];
  status?: 'draft' | 'published';
  right?: ReactNode;
}) {
  return (
    <header className="header trip-header">
      <div className="trip-header-left">
        <a className="brand" href="/">
          <span className="brand-mark">✳</span> WAYFARER
        </a>
        <nav className="crumbs" aria-label="Where you are">
          {crumbs.map((c, i) =>
            c.href ? (
              <a key={i} href={c.href}>
                {c.label}
              </a>
            ) : (
              <span key={i} aria-current="page">
                {c.label}
              </span>
            ),
          )}
        </nav>
      </div>
      <div className="home-actions">
        {status && (
          <span className={`trip-status inline ${status}`}>
            {status === 'draft' ? 'DRAFT' : 'PUBLISHED'}
          </span>
        )}
        {right}
      </div>
    </header>
  );
}
