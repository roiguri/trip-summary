import type { ReactNode } from 'react';

/** A page with one message under the dashed rail drawing (an entry still to come): sign-in, invite
 *  problems and empty states (DESIGN.md, "Home, adding a trip and imports"). */
export function Notice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="notice-page">
      <header className="header notice-header">
        <div className="brand">
          <span className="brand-mark">✳</span> WAYFARER
        </div>
      </header>
      <main className="notice">
        <div className="notice-rail" aria-hidden="true">
          <i />
        </div>
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  );
}
