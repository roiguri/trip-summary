'use client';
import { useEffect, useRef, useState } from 'react';
import { noteDir } from '../lib/format';

/** Note text on the timeline: a place's note under its photos, and the body of a note entry. Both
 *  share one look (user decision) and show the full text, clamped to `lines` lines with "See more"
 *  only when it is actually cut off. Lives inside the entry button, so the toggle is a span with
 *  button semantics and doesn't select the entry. */
export function EntryCaption({
  text,
  lines = 2,
  className = '',
}: {
  text: string;
  lines?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);
  const toggle = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setOpen((o) => !o);
  };
  return (
    <span className={`entry-caption ${className}`} dir={noteDir(text)}>
      <span
        ref={ref}
        className={`entry-caption-text ${open ? 'open' : ''}`}
        style={{ '--lines': lines } as React.CSSProperties}
      >
        {text}
      </span>
      {(clamped || open) && (
        <span
          role="button"
          tabIndex={0}
          className="entry-caption-more"
          aria-expanded={open}
          onClick={toggle}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle(e)}
        >
          {open ? 'See less' : 'See more'}
        </span>
      )}
    </span>
  );
}
