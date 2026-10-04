'use client';
import { useState } from 'react';
import { Brand } from './Brand';
import { SignOutButton } from './SignOutButton';

/** Top bar: the name and the account (DESIGN.md, "Name and top bar"). On phones the account moves
 *  into a menu. */
export function Header({ account }: { account: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="header">
      <Brand href="/" />
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
          <small>
            {account} · <SignOutButton />
          </small>
        </div>
      )}
    </header>
  );
}
