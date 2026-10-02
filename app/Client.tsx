'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Entry, Photo, Trip } from '../lib/data';
import { DetailPanel } from './components/DetailPanel';
import { Header } from './components/Header';
import { Lightbox } from './components/Lightbox';
import { MapIcon } from './components/icons';
import { MapCard } from './components/MapCard';
import { PhoneMap } from './components/PhoneMap';
import { PhoneSheet } from './components/PhoneSheet';
import { Timeline } from './components/Timeline';
import { allPhotos } from './lib/format';
import { useIsPhone } from './lib/useIsPhone';

/**
 * The journey page: the timeline on the left, the map card and detail card on the right, and the
 * photo viewer. This component holds the state they share; each part lives in `components/`.
 */
export default function Client({
  trip,
  account,
  bar,
}: {
  trip: Trip;
  account: string;
  bar?: React.ReactNode;
}) {
  // Nothing is selected at first: the map fills the right column until an entry is chosen (user decision).
  const [selected, setSelected] = useState<Entry | null>(null);
  const [day, setDay] = useState(trip.days[0]?.date ?? '');
  const [album, setAlbum] = useState<string | null>(null);
  const [photoPage, setPhotoPage] = useState(0);
  const [full, setFull] = useState<Photo | null>(null);
  const [activePhoto, setActivePhoto] = useState<Photo | null>(null);
  const [focus, setFocus] = useState<Photo | null>(null);
  // The map and the detail card open and close independently (user decision). The detail card is
  // shown while something is selected or a day album is open; closing it clears the selection.
  // A closed map folds into its header strip (so it can always be reopened); with both closed it
  // narrows into a "Map" pill in the corner and the timeline centres.
  const [mapOpen, setMapOpen] = useState(true);
  const detailsOpen = !!(selected || album);
  // Closing the detail card plays its exit animation before the selection is cleared.
  const [panelClosing, setPanelClosing] = useState(false);
  // Which way the detail card enters and leaves: from/into the corner pill when the map is closed,
  // else folding under the map. Fixed when the card opens and when it closes, so folding or opening
  // the map in between doesn't restart the card's animation.
  const panelCorner = useRef(false);
  const panelWasOpen = useRef(false);
  if (detailsOpen && !panelWasOpen.current) panelCorner.current = !mapOpen;
  panelWasOpen.current = detailsOpen;
  // Everything closed (counted from the start of the detail card's exit, so the map narrows into
  // its pill and the timeline centres while the card leaves, not after).
  const collapsed = !mapOpen && (!detailsOpen || panelClosing);

  // Phones (under 768px) get their own map and details: a full-screen map opened from a floating
  // button, where a tapped pin shows a card (`peek`), and the details in a bottom sheet.
  const isPhone = useIsPhone();
  const [phoneMap, setPhoneMap] = useState(false);
  const [peek, setPeek] = useState<Entry | null>(null);

  const scroller = useRef<HTMLElement>(null);
  const rail = useRef<HTMLElement>(null);
  // While choosing an entry scrolls the timeline, the day comes from the entry, not the scroll.
  const scrollLock = useRef(0);
  const days = trip.days;
  const entriesById = useMemo(
    () => new Map(days.flatMap((d) => d.entries).map((e) => [e.id, e])),
    [days],
  );
  const photos = album
    ? allPhotos(days).filter((p) =>
        days
          .find((d) => d.date === album)
          ?.entries.some((e) => e.photos.some((x) => x.id === p.id)),
      )
    : selected?.photos || [];

  function closeDetails() {
    panelCorner.current = !mapOpen;
    setPanelClosing(true);
    window.setTimeout(() => {
      setSelected(null);
      setAlbum(null);
      setActivePhoto(null);
      setFocus(null);
      setPanelClosing(false);
    }, 360); // the exit animation (--col-motion, 0.34s) plus a frame
  }
  /** `from` is the day a stay was opened from (check-out or end-of-day marker): the timeline
   *  stays where it is and that day stays current, instead of jumping back to the check-in. */
  function choose(e: Entry, from?: string) {
    const root = scroller.current;
    const target = root?.querySelector(`[data-entry-id="${e.id}"]`);
    if (target && root && !from) {
      const top =
        target.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
      scrollLock.current = Date.now() + 900;
      root.scrollTo({ top: Math.max(0, top - 60), behavior: 'smooth' });
    }
    setSelected(e);
    setAlbum(null);
    setPhotoPage(0);
    setActivePhoto(null);
    setFocus(null);
    setDay(from ?? e.day);
  }
  function showAlbum(d: string) {
    setDay(d);
    setAlbum(d);
    setSelected(null);
    setPhotoPage(0);
    setActivePhoto(null);
    setFocus(null);
  }
  function closePhoneMap() {
    setPhoneMap(false);
    setPeek(null);
  }
  function pickPhoto(p: Photo) {
    setActivePhoto(p);
    setFocus(p);
    setFull(p);
  }

  // Keyboard (Part 13): Escape closes the photo viewer first (the viewer handles that itself),
  // then the detail card.
  useEffect(() => {
    function key(ev: KeyboardEvent) {
      if (ev.key !== 'Escape' || full) return;
      if (detailsOpen && !panelClosing) closeDetails();
      else if (phoneMap && !detailsOpen) closePhoneMap();
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    // The current day is the topmost day inside the reading band. Tracking every day in the band
    // (not only the one that just entered) keeps it right after a smooth scroll passes a day
    // boundary and comes back.
    const inBand = new Set<string>();
    const order = [...root.querySelectorAll<HTMLElement>('[data-day]')].map((e) => e.dataset.day!);
    const observer = new IntersectionObserver(
      (records) => {
        for (const r of records) {
          const id = (r.target as HTMLElement).dataset.day;
          if (!id) continue;
          if (r.isIntersecting) inBand.add(id);
          else inBand.delete(id);
        }
        const top = order.find((d) => inBand.has(d));
        if (top && Date.now() > scrollLock.current) setDay(top);
      },
      { root, rootMargin: '-15% 0px -65% 0px' },
    );
    root.querySelectorAll('[data-day]').forEach((e) => observer.observe(e));
    return () => observer.disconnect();
  }, []);

  return (
    <main
      className={`shell ${collapsed ? 'collapsed' : ''} ${bar ? 'with-bar' : ''}`}
      style={
        {
          // An absolute length (a share of the right column, which spans the viewport minus 91px and
          // an editor's bar), so the folding map card can keep its content at full size inside.
          '--map-height': 'calc((100dvh - 91px - var(--bar)) * 0.4)',
        } as React.CSSProperties
      }
    >
      <Header account={account} />
      {bar}
      <section className="left" ref={scroller}>
        <div className="intro">
          <div className="kicker">03 / THE JOURNEY</div>
          <h1>{trip.title}</h1>
          <p>{[trip.subtitle, trip.timezone].filter(Boolean).join(' · ')}</p>
        </div>
        <Timeline
          days={days}
          railRef={rail}
          selected={selected}
          album={album}
          entriesById={entriesById}
          onChoose={choose}
          onShowAlbum={showAlbum}
        />
      </section>
      {isPhone ? (
        <>
          {!phoneMap && (
            <button className="map-fab" onClick={() => setPhoneMap(true)}>
              <MapIcon /> Map
            </button>
          )}
          {phoneMap && (
            <PhoneMap
              trip={trip}
              day={day}
              onDay={setDay}
              selected={selected}
              focused={focus}
              peek={peek}
              onPeek={(e) => {
                setPeek(e);
                setDay(e.day);
              }}
              onDetails={choose}
              onClose={closePhoneMap}
            />
          )}
          {detailsOpen && (
            <PhoneSheet
              key={album || selected?.id}
              title={
                album ? (days.find((d) => d.date === album)?.title ?? '') : (selected?.title ?? '')
              }
              closing={panelClosing}
              onClose={closeDetails}
            >
              <DetailPanel
                selected={selected}
                album={album}
                days={days}
                photos={photos}
                page={photoPage}
                onPage={setPhotoPage}
                activePhoto={activePhoto}
                onPickPhoto={pickPhoto}
                closing={panelClosing}
                fromCorner={panelCorner.current}
                onClose={closeDetails}
              />
            </PhoneSheet>
          )}
        </>
      ) : (
        <aside className="right">
          <MapCard
            trip={trip}
            open={mapOpen}
            collapsed={collapsed}
            onOpen={setMapOpen}
            selected={selected}
            focused={focus}
            day={day}
            onSelect={choose}
            onWholeTrip={() => setDay('')}
          />
          {detailsOpen && (
            <DetailPanel
              selected={selected}
              album={album}
              days={days}
              photos={photos}
              page={photoPage}
              onPage={setPhotoPage}
              activePhoto={activePhoto}
              onPickPhoto={pickPhoto}
              closing={panelClosing}
              fromCorner={panelCorner.current}
              onClose={closeDetails}
            />
          )}
        </aside>
      )}
      {full && (
        <Lightbox photo={full} set={photos} onChange={setFull} onClose={() => setFull(null)} />
      )}
    </main>
  );
}
