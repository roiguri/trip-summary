// How a trip is named on its card: its dates, length and the count in the page title.

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const parts = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return { y, m: MONTHS[m - 1], day };
};

/** "MAY 15–20, 2026", "MAY 30 – JUN 2, 2026", "DEC 30, 2026 – JAN 2, 2027". */
export function tripDates(start: string | null, end: string | null) {
  if (!start) return 'NO DATES YET';
  const a = parts(start);
  const b = parts(end ?? start);
  if (start === (end ?? start)) return `${a.m} ${a.day}, ${a.y}`;
  if (a.y !== b.y) return `${a.m} ${a.day}, ${a.y} – ${b.m} ${b.day}, ${b.y}`;
  if (a.m !== b.m) return `${a.m} ${a.day} – ${b.m} ${b.day}, ${a.y}`;
  return `${a.m} ${a.day}–${b.day}, ${a.y}`;
}

export function dayCount(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const n =
    Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) +
    1;
  return `${n} ${n === 1 ? 'DAY' : 'DAYS'}`;
}

const WORDS = [
  'No',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
];
/** "Four journeys", "One journey", "23 journeys". */
export const journeys = (n: number) => `${WORDS[n] ?? n} ${n === 1 ? 'journey' : 'journeys'}`;
