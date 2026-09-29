'use client';
import { useState } from 'react';

/** Top bar. On phones the nav and the demo notice move into a menu. */
export function Header() {
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
      <span className="status">View-only demo · sign-in not configured</span>
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
          <small>View-only demo · sign-in not configured</small>
        </div>
      )}
    </header>
  );
}
