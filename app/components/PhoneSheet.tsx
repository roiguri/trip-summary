'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const GRAB = 44; // the handle row, which is also the × row and, at full height, the pinned title
const HALF = 2 / 3; // opens at two thirds of the screen (user decision), or lower if the entry is short

/**
 * The details sheet on a phone (user decision, option 3A). It opens at two thirds of the screen, or
 * at the entry's own height if that is less. Dragging the handle up, or scrolling the content,
 * takes it to full height: all of its content, up to the whole screen (over the header), where the
 * title pins next to × once the large one scrolls away. Dragging down, or pulling down at the top of the content, goes back to two thirds
 * and then closes; so do × and tapping outside. The height is always explicit, so every change
 * animates, and follows the finger while dragging.
 */
export function PhoneSheet({
  title,
  closing,
  onClose,
  children,
}: {
  title: string;
  closing: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  const [vh, setVh] = useState(0);
  const [contentH, setContentH] = useState(0);
  const [full, setFull] = useState(false);
  const [opened, setOpened] = useState(false);
  const [drag, setDrag] = useState<number | null>(null); // height while dragging
  const [pinned, setPinned] = useState(false);
  const gesture = useRef<{ y: number; h: number } | null>(null);

  // Two thirds, or the entry's own height if less; "full" is all of the content, up to the screen.
  const half = Math.min(contentH + GRAB, Math.round(vh * HALF));
  const top = Math.min(contentH + GRAB, vh);
  const canExpand = top > half + 1;
  const atTop = full && top >= vh;
  const target = closing || !opened ? 0 : full ? top : half;
  const height = drag ?? target;

  useLayoutEffect(() => {
    const measure = () => {
      setVh(window.innerHeight);
      const panel = body.current?.firstElementChild as HTMLElement | null;
      if (panel) setContentH(panel.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (body.current?.firstElementChild) ro.observe(body.current.firstElementChild);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  // Open from 0 on the next frame, so the rise animates.
  useEffect(() => {
    const id = requestAnimationFrame(() => setOpened(true));
    return () => cancelAnimationFrame(id);
  }, []);

  /** Where a drag ends: past halfway to the top goes full height, most of the way down closes,
   *  anything else is two thirds. */
  function settle(h: number) {
    setDrag(null);
    if (canExpand && h > (half + top) / 2) setFull(true);
    else if (h >= half * 0.7) setFull(false);
    else onClose();
  }

  // Dragging the handle row.
  const grab = {
    onPointerDown: (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      gesture.current = { y: e.clientY, h: height };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const g = gesture.current;
      if (!g) return;
      const max = canExpand ? top : half;
      setDrag(Math.max(0, Math.min(max, g.h - (e.clientY - g.y))));
    },
    onPointerUp: () => release(),
    // A cancelled gesture (the browser took over) settles where it is, so the sheet never sticks.
    onPointerCancel: () => release(),
  };
  function release() {
    if (!gesture.current) return;
    gesture.current = null;
    if (drag != null) settle(drag);
  }

  // Pulling down at the top of the content (touch), and scrolling the content up to expand.
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    let start: { y: number; h: number } | null = null;
    let pulled: number | null = null;
    const down = (ev: TouchEvent) => {
      start =
        el.scrollTop <= 0 ? { y: ev.touches[0].clientY, h: el.parentElement!.offsetHeight } : null;
      pulled = null;
    };
    const move = (ev: TouchEvent) => {
      if (!start) return;
      const dy = ev.touches[0].clientY - start.y;
      if (dy > 0 && el.scrollTop <= 0) {
        ev.preventDefault();
        pulled = Math.max(0, start.h - dy);
        setDrag(pulled);
      }
    };
    const up = () => {
      if (pulled != null) settle(pulled);
      start = null;
      pulled = null;
    };
    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', up);
    return () => {
      el.removeEventListener('touchstart', down);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', up);
    };
  });

  function onScroll() {
    const el = body.current!;
    if (!full && canExpand && el.scrollTop > 8) setFull(true);
    // The title pins once the large one has scrolled out from under the handle row.
    const big = el.querySelector('h2');
    setPinned(
      atTop && !!big && big.getBoundingClientRect().bottom < el.getBoundingClientRect().top,
    );
  }

  return (
    <>
      <div
        className={`sheet-backdrop ${opened && !closing ? 'shown' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`phone-sheet ${atTop ? 'is-full' : ''} ${drag != null ? 'is-dragging' : ''}`}
        style={{ height }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sheet-grab" {...grab}>
          <span className="sheet-handle" />
          <strong className={pinned ? 'shown' : ''}>{title}</strong>
          <button className="card-close" title="Close details" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="sheet-body" ref={body} onScroll={onScroll}>
          {children}
        </div>
      </div>
    </>
  );
}
