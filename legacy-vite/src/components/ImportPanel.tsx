/**
 * Import panel: brings the three data sources into the app.
 * All parsing is local - files never leave the device.
 */
import { useRef, useState } from 'react';
import { importGoogleMapsTimeline } from '../lib/importers/googleMapsTimeline';
import { importGooglePhotos } from '../lib/importers/googlePhotos';
import { importNotes } from '../lib/importers/notes';
import { buildTimeline } from '../lib/buildTimeline';
import { parseTripExport } from '../lib/storage';
import { sampleTrip } from '../data/sampleTrip';
import { Trip } from '../types';

interface Props {
  trip: Trip | null;
  onTrip: (trip: Trip) => void;
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function ImportPanel({ trip, onTrip }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const mapsRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);

  async function handle(kind: 'maps' | 'photos' | 'notes' | 'backup', file: File) {
    setError(null);
    setStatus(null);
    try {
      const text = await readFile(file);
      if (kind === 'backup') {
        onTrip(parseTripExport(text));
        setStatus('Trip backup restored.');
        return;
      }
      if (kind === 'maps') {
        const places = importGoogleMapsTimeline(text);
        onTrip(buildTimeline({ base: trip ?? undefined, places }));
        setStatus(`Imported ${places.length} place visits from Google Maps Timeline.`);
      } else if (kind === 'photos') {
        const photos = importGooglePhotos(text);
        onTrip(buildTimeline({ base: trip ?? undefined, photos }));
        setStatus(`Imported ${photos.length} photos.`);
      } else {
        const { tripName, days } = importNotes(text);
        onTrip(buildTimeline({ base: trip ?? undefined, tripName, noteDays: days }));
        setStatus(`Imported notes for ${days.length} days.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    }
  }

  return (
    <section className="panel import-panel">
      <h2>Import trip data</h2>
      <p className="muted">
        Everything is parsed on this device and saved in this browser. Nothing is uploaded.
      </p>
      <div className="import-grid">
        <button onClick={() => mapsRef.current?.click()}>Google Maps Timeline (.json)</button>
        <button onClick={() => photosRef.current?.click()}>Google Photos export (.json)</button>
        <button onClick={() => notesRef.current?.click()}>My planning & notes (.json)</button>
        <button onClick={() => backupRef.current?.click()}>Restore trip backup (.json)</button>
        <button className="secondary" onClick={() => onTrip(sampleTrip)}>
          Load sample data
        </button>
      </div>
      <input ref={mapsRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && handle('maps', e.target.files[0])} />
      <input ref={photosRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && handle('photos', e.target.files[0])} />
      <input ref={notesRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && handle('notes', e.target.files[0])} />
      <input ref={backupRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && handle('backup', e.target.files[0])} />
      {status && <p className="ok">{status}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
