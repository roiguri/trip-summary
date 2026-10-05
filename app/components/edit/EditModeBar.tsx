'use client';

/** The editors' bar in edit mode (DESIGN.md, "Edit mode, round 2", T1 and R1): how many findings
 *  wait, Previous and Next to walk through them on the timeline, and "Show resolved". */
export function EditModeBar({
  tripId,
  status,
  open,
  setAside,
  position,
  onStep,
  showSetAside,
  onShowSetAside,
  newPhotos,
  onReviewNew,
}: {
  tripId: string;
  status: 'draft' | 'published';
  open: number;
  setAside: number;
  /** The finding last stepped to (0-based), or -1. */
  position: number;
  onStep: (by: 1 | -1) => void;
  showSetAside: boolean;
  onShowSetAside: (on: boolean) => void;
  /** How many photos are new, to review them all full screen. */
  newPhotos: number;
  onReviewNew: () => void;
}) {
  return (
    <div className="editor-bar">
      <span className="trip-status inline draft">EDITING</span>
      {open > 0 ? (
        <span className="review-step">
          <span>{position >= 0 ? `${position + 1} of ${open}` : `${open} to review`}</span>
          <button
            className="pill-button small"
            onClick={() => onStep(-1)}
            aria-label="Previous finding"
          >
            <Chevron up /> <span className="long">Previous</span>
          </button>
          <button
            className="pill-button small primary"
            onClick={() => onStep(1)}
            aria-label="Next finding"
          >
            <span className="long">Next</span> <Chevron />
          </button>
        </span>
      ) : (
        <span className="bar-hint">Nothing to review</span>
      )}
      {(setAside > 0 || showSetAside) && (
        <label className="switch">
          <input
            type="checkbox"
            checked={showSetAside}
            onChange={(e) => onShowSetAside(e.target.checked)}
          />
          <i aria-hidden="true" />
          <span>
            <span className="long">Show resolved</span>
            <span className="short">Resolved</span> · {setAside}
          </span>
        </label>
      )}
      {status === 'published' && <span className="bar-hint long">Viewers see changes at once</span>}
      {newPhotos > 0 && (
        <button className="pill-button small" onClick={onReviewNew}>
          <span className="long">Review new photos · </span>
          {newPhotos}
          <span className="short"> new</span>
        </button>
      )}
      <span className="bar-space" />
      <a className="pill-button small" href="?view=viewer">
        Preview as a viewer
      </a>
      <a className="pill-button small primary" href={`/trips/${encodeURIComponent(tripId)}`}>
        Done
      </a>
    </div>
  );
}

function Chevron({ up = false }: { up?: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={up ? 'M2.5 7.5 6 4l3.5 3.5' : 'M2.5 4.5 6 8l3.5-3.5'} />
    </svg>
  );
}
