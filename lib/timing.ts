// Server timings (docs/ARCHITECTURE.md, "Production"): how long each step of a request took, sent as
// a Server-Timing header (the browser's network panel shows it) or logged, to find what's slow on
// the live site.
export function timer() {
  const start = performance.now();
  let last = start;
  const steps: [string, number][] = [];
  return {
    /** Ends a step, named for what it did. */
    mark(name: string) {
      const now = performance.now();
      steps.push([name, now - last]);
      last = now;
    },
    /** The Server-Timing header's value: each step and the total, in milliseconds. */
    header() {
      return [...steps, ['total', performance.now() - start] as [string, number]]
        .map(([n, d]) => `${n};dur=${Math.round(d)}`)
        .join(', ');
    },
  };
}
