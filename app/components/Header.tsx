'use client';
import { useState } from 'react';
import { SignOutButton } from './SignOutButton';

/** Top bar. On phones the nav and the account move into a menu. */
export function Header({ account }: { account: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="header">
      <div className="brand">
        <span className="brand-mark">✳</span> WAYFARER
      </div>
      <nav className="nav">
        <span className="nav-active">THE JOURNEY</span>
        <span>WISHLIST</span>
        <span>PLACES</span>
      </nav>
      <span className="status">
        {account} · <SignOutButton />
      </span>
      <button
        className="menu-button"
        aria-label="Menu"
        aria-expanded={menuOpen}
        aria-controls="phone-menu"
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <span />
        <span />
        <span />
      </button>
      {menuOpen && (
        <div className="phone-menu" id="phone-menu" onClick={() => setMenuOpen(false)}>
          <span className="nav-active">THE JOURNEY</span>
          <span>WISHLIST</span>
          <span>PLACES</span>
          <small>
            {account} · <SignOutButton />
          </small>
        </div>
      )}
    </header>
  );
}
