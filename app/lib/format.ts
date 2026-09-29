import type { Day, Entry } from '../../lib/data';

export const allPhotos = (days: Day[]) => days.flatMap((d) => d.entries.flatMap((e) => e.photos));
/** The detail card's label for each kind of entry. */
export const KICKERS: Record<Entry['type'], string> = {
  place: 'THE PLACE',
  lodging: 'THE STAY',
  transit: 'THE ROUTE',
  note: 'THE NOTE',
  photo: 'A MOMENT',
  cluster: 'PHOTOS',
};
export function noteDir(s: string): 'ltr' | 'rtl' {
  for (const ch of s) {
    if (/[֐-ࣿ]/.test(ch)) return 'rtl';
    if (/[A-Za-z]/.test(ch)) return 'ltr';
  }
  return 'ltr';
}

export function zoneLabel(zone: string | null) {
  if (!zone) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'shortGeneric',
    }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value || zone;
  } catch {
    return zone.split('/').pop()?.replace(/_/g, ' ') || zone;
  }
}
/** Transit times: one zone label when both ends share it ("09:00 → 09:45 (PT)"), else a label on
 *  each end ("12:30 PT → 15:55 MT"). */
export function transitTimes(e: Entry) {
  const dep = zoneLabel(e.departure_timezone);
  const arr = zoneLabel(e.arrival_timezone);
  if (!e.end_time) return `${e.time}${dep ? ` (${dep})` : ''}`;
  if (dep && arr && dep !== arr) return `${e.time} ${dep} → ${e.end_time} ${arr}`;
  return `${e.time} → ${e.end_time}${dep || arr ? ` (${dep || arr})` : ''}`;
}
/** A day's date as shown on the page, e.g. "Friday, May 15" (long) or "Fri, May 15" (short). */
export function formatDay(date: string, style: 'long' | 'short' = 'long') {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    weekday: style,
    month: style,
    day: 'numeric',
  });
}
