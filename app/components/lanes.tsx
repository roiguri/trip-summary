import { useMemo } from 'react';

/**
 * A multi-day lane drawn as one dotted path: it leaves the start node's centre diagonally, eases
 * out to its lane `9 * (lane + 1)` px right of the rail, runs down, and eases back in to arrive
 * diagonally at the end diamond's centre (the start curve mirrors the end). Dots are spaced evenly
 * (~12px) along the whole path from the node centre to the diamond centre, so the curves and the
 * straight part share one rhythm and both ends are mirror images; dots that land inside the node
 * or the diamond are hidden behind them.
 * Coordinates are relative to the start node's centre (x right, y down).
 */
const DOT_SPACING = 12;
const CURVE_RISE = 24;
type Point = [number, number];
function lanePath(lane: number, height: number) {
  const dx = 9 * (lane + 1);
  const rise = Math.min(CURVE_RISE + 6 * lane, height / 2);
  const cubic = (a: Point, b: Point, c: Point, d: Point) => (t: number) =>
    [0, 1].map(
      (k) =>
        (1 - t) ** 3 * a[k] +
        3 * (1 - t) ** 2 * t * b[k] +
        3 * (1 - t) * t * t * c[k] +
        t ** 3 * d[k],
    ) as Point;
  const segments = [
    cubic([0, 0], [dx * 0.55, dx * 0.55], [dx, rise * 0.45], [dx, rise]),
    (t: number) => [dx, rise + t * (height - 2 * rise)] as Point,
    cubic(
      [dx, height - rise],
      [dx, height - rise * 0.45],
      [dx * 0.55, height - dx * 0.55],
      [0, height],
    ),
  ];
  const samples: { s: number; p: Point }[] = [{ s: 0, p: [0, 0] }];
  for (const seg of segments)
    for (let k = 1; k <= 200; k++) {
      const p = seg(k / 200);
      const q = samples[samples.length - 1];
      samples.push({ s: q.s + Math.hypot(p[0] - q.p[0], p[1] - q.p[1]), p });
    }
  const length = samples[samples.length - 1].s;
  // Interpolate between samples so dot spacing is exact even on the long straight segment.
  const pointAt = (s: number): Point => {
    const found = samples.findIndex((x) => x.s >= s);
    // Past the last sample (rounding at the very end): use the end point.
    if (found === -1) return samples[samples.length - 1].p;
    const i = Math.max(1, found);
    const a = samples[i - 1];
    const b = samples[i] ?? a;
    const f = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
    return [a.p[0] + (b.p[0] - a.p[0]) * f, a.p[1] + (b.p[1] - a.p[1]) * f];
  };
  // A whole number of gaps from node centre to diamond centre, so the start and end curves carry
  // mirror-image dots; the spacing stays within a fraction of a pixel of 12px.
  const gaps = Math.max(1, Math.round(length / DOT_SPACING));
  const dots: Point[] = [];
  for (let k = 0; k <= gaps; k++) dots.push(pointAt((length * k) / gaps));
  const d =
    `M0,0 C${dx * 0.55},${dx * 0.55} ${dx},${rise * 0.45} ${dx},${rise} ` +
    `L${dx},${height - rise} ` +
    `C${dx},${height - rise * 0.45} ${dx * 0.55},${height - dx * 0.55} 0,${height}`;
  return { dots, d, dx };
}
export function LanePath({
  lane,
  x,
  y0,
  y1,
  className,
  onHover,
}: {
  lane: number;
  x: number;
  y0: number;
  y1: number;
  className: string;
  onHover: (on: boolean) => void;
}) {
  const height = Math.max(0, y1 - y0);
  const { dots, d, dx } = useMemo(() => lanePath(lane, height), [lane, height]);
  const pad = 8;
  return (
    <svg
      className={className}
      width={dx + pad * 2}
      height={height + pad * 2}
      style={{ left: x - pad, top: y0 - pad }}
      aria-hidden="true"
    >
      <g transform={`translate(${pad} ${pad})`}>
        {/* A 13px-wide invisible hover band along the path. */}
        <path
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth={13}
          pointerEvents="stroke"
          onMouseEnter={() => onHover(true)}
          onMouseLeave={() => onHover(false)}
        />
        {dots.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={1} />
        ))}
      </g>
    </svg>
  );
}

/** Lane colour class: lane-0..2 for drawn lanes, lane-x for spans shown without a line. */
export function laneClass(lane: number) {
  return lane < 0 ? 'lane-x' : `lane-${lane}`;
}
