'use client';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useState, useTransition } from 'react';
import type { Day, Trip } from '../../../lib/data';
import type { EditData } from '../../../lib/edit-view';

export type EditChange = {
  target: string;
  key: string;
  field: string;
  value?: string | number | boolean | null;
};

/** A save's answer: what changed, from the merge the save ran (the edits route). */
export type Saved = {
  builtAt: string;
  meta: Omit<Trip, 'days'>;
  dates: string[];
  days: Day[];
  edit: EditData;
};
/** Applies a save's answer to the page in place; false when it can't (then the page reloads). */
export type ApplySaved = (saved: Saved) => boolean;
export const SavedContext = createContext<ApplySaved | null>(null);

/** Saves edits (a value of `undefined` undoes one), then updates the page in place from the answer
 *  (or, failing that, re-renders it from the server). `busy` lasts until the page shows the
 *  change, so nothing looks unchanged and clickable in between. */
export function useSave(tripId: string, applyHere?: ApplySaved | null) {
  const router = useRouter();
  const fromContext = useContext(SavedContext);
  const apply = applyHere ?? fromContext;
  const [saving, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const busy = saving || refreshing;
  const [error, setError] = useState<string | null>(null);
  async function save(edits: EditChange[]) {
    if (!edits.length) return true;
    setBusy(true);
    setError(null);
    const r = await fetch(`/api/trips/${encodeURIComponent(tripId)}/edits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ edits }),
    }).catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      setError(r ? await r.text() : 'Not saved: check the connection and try again.');
      return false;
    }
    const saved = (await r.json().catch(() => null)) as Saved | null;
    startRefresh(() => {
      if (!saved || !apply?.(saved)) router.refresh();
    });
    return true;
  }
  return { save, busy, error };
}

export { mapsLink } from '../../../lib/maps-link';

export const metres = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const rad = Math.PI / 180;
  const x = (bLng - aLng) * rad * Math.cos(((aLat + bLat) / 2) * rad);
  const y = (bLat - aLat) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
};
export const distance = (m: number) =>
  m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
export const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`)
    .toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    })
    .toUpperCase();
