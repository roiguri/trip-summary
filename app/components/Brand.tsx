/** The app's name and mark (DESIGN.md, "Name and top bar"): Afterglow, a sun on the horizon. */
export function Brand({ href }: { href?: string }) {
  const inner = (
    <>
      <SunMark />
      <span className="brand-name">Afterglow</span>
    </>
  );
  return href ? (
    <a className="brand" href={href}>
      {inner}
    </a>
  ) : (
    <span className="brand">{inner}</span>
  );
}

export function SunMark() {
  return (
    <svg className="brand-mark" width="34" height="24" viewBox="0 0 42 30" aria-hidden="true">
      <path d="M7 22a14 14 0 0 1 28 0" fill="#f2c9a5" />
      <path d="M12 22a9 9 0 0 1 18 0" fill="#e0a07a" />
      <path d="M3 24h36" stroke="#dcead6" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
