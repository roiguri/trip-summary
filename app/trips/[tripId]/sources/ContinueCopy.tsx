'use client';
import { startBackgroundCopy } from '../../../components/BackgroundCopy';

/** Carries on an unfinished photo copy in this browser (if it stopped, or this is another browser):
 *  the photos already copied are kept, so it picks up where it left off. */
export function ContinueCopy({ tripId, title }: { tripId: string; title: string }) {
  return (
    <button
      className="pill-button small primary"
      onClick={() => startBackgroundCopy(tripId, title)}
    >
      Continue copying
    </button>
  );
}
