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
            ▲ <span className="long">Previous</span>
          </button>
          <button
            className="pill-button small primary"
            onClick={() => onStep(1)}
            aria-label="Next finding"
          >
            <span className="long">Next</span> ▼
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
