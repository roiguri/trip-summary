'use client';
import type { Day, Entry, Photo } from '../../lib/data';
import { KICKERS, formatDay, transitTimes } from '../lib/format';
import { EntryCaption } from './EntryCaption';
import { PagerChevron, TransitIcon } from './icons';

const PER_PAGE = 12;

/**
 * The detail card for the selected entry or day album: a label row (what it is, and the date), the
 * title, a metadata line, the photos with their count and pager, the note, and the Maps link.
 */
export function DetailPanel({
  selected,
  album,
  days,
  photos,
  page,
  onPage,
  activePhoto,
  onPickPhoto,
  closing,
  fromCorner,
  onClose,
}: {
  selected: Entry | null;
  album: string | null;
  days: Day[];
  photos: Photo[];
  page: number;
  onPage: (page: number) => void;
  activePhoto: Photo | null;
  onPickPhoto: (p: Photo) => void;
  closing: boolean;
  fromCorner: boolean;
  onClose: () => void;
}) {
  const pagePhotos = photos.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
  const pages = Math.ceil(photos.length / PER_PAGE);
  const title = album ? days.find((d) => d.date === album)?.title : selected?.title;
  return (
    <section
      className={`panel ${album ? 'panel-album' : `panel-${selected?.type}`} ${closing ? 'is-closing' : ''} ${fromCorner ? 'from-corner' : ''}`}
    >
      <button className="card-close panel-close" title="Close details" onClick={onClose}>
        ×
      </button>
      <div className="panel-body-wrap" key={`${album || selected?.id}-${page}`}>
        <div className="panel-body">
          {/* What the entry is, and its date (user decision: one label row above the title). */}
          <div className="panel-kicker">
            <span>{album ? 'THE DAY' : selected ? KICKERS[selected.type] : ''}</span>
            <span>{album || selected?.day}</span>
          </div>
          {title && <h2>{title}</h2>}
          {album && (
            <div className="meta">
              <span className="meta-time">
                Day {days.findIndex((d) => d.date === album) + 1} · {formatDay(album)} ·{' '}
                {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
              </span>
            </div>
          )}
          {!album && selected && selected.type !== 'lodging' && (
            <div className="meta">
              {selected.type === 'transit' ? (
                <>
                  {selected.mode && (
                    <span className="meta-mode">
                      <TransitIcon mode={selected.mode} />
                    </span>
                  )}
                  <span className="meta-route">
                    {selected.from_location || 'Origin'} → {selected.to_location || 'Destination'}
                  </span>
                  <span className="meta-time">{transitTimes(selected)}</span>
                </>
              ) : (
                <span className="meta-time">
                  {selected.time}
                  {selected.end_time ? ` – ${selected.end_time}` : ''}
                </span>
              )}
              {selected.type === 'place' && selected.tags.map((t) => <em key={t}>{t}</em>)}
            </div>
          )}
          {selected?.type === 'lodging' && !album && (
            <div className="stay-info">
              <span>
                CHECK-IN
                <br />
                <b>
                  {selected.day} · {selected.time}
                </b>
              </span>
              <span>
                CHECK-OUT
                <br />
                <b>{selected.check_out}</b>
              </span>
            </div>
          )}
          {photos.length > 0 && (
            <>
              {/* The grid is chosen from the whole set, so every page keeps the same layout. */}
              <div className={`photos count-${Math.min(photos.length, PER_PAGE)} arrows-a`}>
                {pagePhotos.map((p) => (
                  <button
                    className={`photo ${activePhoto?.id === p.id ? 'photo-active' : ''}`}
                    key={p.id}
                    onClick={() => onPickPhoto(p)}
                  >
                    <img src={p.url} alt={p.caption} />
                    <span>{p.caption}</span>
                  </button>
                ))}
              </div>
              {/* One photo: no count or arrows; one page: the count only (user decision). */}
              {photos.length > 1 && (
                <div className="pagination pagination-a">
                  <small>
                    {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
                  </small>
                  {pages > 1 && (
                    <div>
                      <button
                        aria-label="Previous photos"
                        disabled={page === 0}
                        onClick={() => onPage(page - 1)}
                      >
                        <PagerChevron back />
                      </button>
                      <span>
                        {page + 1} / {pages}
                      </span>
                      <button
                        aria-label="Next photos"
                        disabled={page + 1 >= pages}
                        onClick={() => onPage(page + 1)}
                      >
                        <PagerChevron />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {/* The same paper note as on the timeline, without the tape (user decision). */}
          {!album && selected?.notes && (
            <EntryCaption className="panel-note" text={selected.notes} lines={4} />
          )}
          {!album &&
            (selected?.type === 'place' || selected?.type === 'lodging') &&
            selected.lat != null && (
              <a
                className="maps-link"
                target="_blank"
                rel="noreferrer"
                href={
                  selected.maps_url ||
                  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${selected.lat},${selected.lng}`)}`
                }
              >
                View on Google Maps ↗
              </a>
            )}
        </div>
      </div>
    </section>
  );
}
