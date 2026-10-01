'use client';
import { useEffect, useRef } from 'react';
import type { Photo } from '../../lib/data';
import { formatDay, noteDir } from '../lib/format';

/**
 * Full-screen photo viewer (Part 11): blurred backdrop, framed photo, round chevron arrows, and a
 * bottom bar with the caption, when it was taken and its position in the set. It is a dialog: it
 * takes focus, keeps Tab inside, and returns focus to where it was on closing. ←/→ or a sideways
 * swipe move through the set and Escape closes it. On touch screens the arrows are hidden.
 */
export function Lightbox({
  photo,
  set,
  onChange,
  onClose,
}: {
  photo: Photo;
  set: Photo[];
  onChange: (p: Photo) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const index = set.findIndex((p) => p.id === photo.id);
  const step = (by: number) => onChange(set[(index + by + set.length) % set.length]);
  const close = () => {
    onClose();
    returnFocus.current?.focus();
  };
  // Swiping sideways moves through the set (touch, or a mouse drag); a swipe isn't a tap, so it
  // doesn't close the viewer.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const pointer = {
    onPointerDown: (e: React.PointerEvent) => {
      swipe.current = { x: e.clientX, y: e.clientY };
      swiped.current = false;
    },
    onPointerUp: (e: React.PointerEvent) => {
      const s = swipe.current;
      swipe.current = null;
      if (!s || set.length < 2) return;
      const dx = e.clientX - s.x,
        dy = e.clientY - s.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        swiped.current = true;
        step(dx < 0 ? 1 : -1);
      }
    },
  };
  const tap = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    if (swiped.current) swiped.current = false;
    else action();
  };

  useEffect(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('.light-close')?.focus();
  }, []);
  useEffect(() => {
    function key(ev: KeyboardEvent) {
      if (ev.key === 'Escape') close();
      if (ev.key === 'ArrowRight') step(1);
      if (ev.key === 'ArrowLeft') step(-1);
      if (ev.key === 'Tab' && box.current) {
        const items = [...box.current.querySelectorAll<HTMLElement>('button')];
        const at = items.indexOf(document.activeElement as HTMLElement);
        items[(at + (ev.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
        ev.preventDefault();
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  return (
    <div
      className="lightbox"
      ref={box}
      role="dialog"
      aria-modal="true"
      aria-label={photo.caption || 'Photo'}
      onClick={(e) => tap(e, close)}
      {...pointer}
    >
      <button
        className="light-btn light-close"
        aria-label="Close"
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
      {set.length > 1 && (
        <button
          className="light-btn light-nav prev"
          aria-label="Previous photo"
          onClick={(e) => {
            e.stopPropagation();
            step(-1);
          }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3.5 5.5 8l4.5 4.5" />
          </svg>
        </button>
      )}
      <figure className="light-figure" onClick={(e) => tap(e, () => {})}>
        <img key={photo.id} src={photo.url} alt={photo.caption} draggable={false} />
      </figure>
      {set.length > 1 && (
        <button
          className="light-btn light-nav next"
          aria-label="Next photo"
          onClick={(e) => {
            e.stopPropagation();
            step(1);
          }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M6 3.5 10.5 8 6 12.5" />
          </svg>
        </button>
      )}
      <div className="light-bar" onClick={(e) => e.stopPropagation()}>
        <div className="light-text">
          {photo.caption && <strong dir={noteDir(photo.caption)}>{photo.caption}</strong>}
          <small>
            {formatDay(photo.date, 'short')} · {photo.time}
          </small>
        </div>
        {set.length > 1 && (
          <span className="light-count">
            {index + 1} / {set.length}
          </span>
        )}
      </div>
    </div>
  );
}
