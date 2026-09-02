'use client';
import { useCallback, useEffect, useRef } from 'react';

/**
 * CityStage, an interactive 3D "market city" built entirely from CSS 3D
 * transforms (per the build spec: no WebGL unless CSS cannot achieve the
 * result; here it can, with better perf and zero bundle cost).
 *
 * The towers are not decoration: each labeled tower is a real job source and
 * its height follows its live listing count. The scene is draggable (orbit)
 * and, when a scrollProgressRef is provided, the page scroll dollies the
 * camera through the city (scroll = camera control).
 *
 * Truthfulness: when live data is missing the scene renders unlabeled
 * decorative towers rather than invented numbers.
 */

export interface MarketData {
  total: number;
  sources: { name: string; count: number }[];
  companies: { name: string; count: number }[];
  checkedAt: string | null;
}

export const EMPTY_MARKET: MarketData = { total: 0, sources: [], companies: [], checkedAt: null };

type Tower = {
  key: string;
  label: string | null;
  count: number | null;
  x: number; y: number;       // ground position (px, within the 760px plane)
  w: number; d: number;       // footprint
  h: number;                  // extrusion height
  minor: boolean;
  spotlight?: 'match' | 'apply';
};

/** Deterministic PRNG so server render and client hydration agree exactly. */
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GROUND = 760;
const heightFor = (count: number, max: number) => 70 + Math.round(Math.sqrt(count / Math.max(max, 1)) * 190);

function buildTowers(market: MarketData): Tower[] {
  const rand = mulberry(20260902);
  const towers: Tower[] = [];
  const labeled = [...market.sources.map((s, i) => ({ name: s.name, count: s.count, kind: 'source' as const, i }))];
  const maxCount = Math.max(1, ...labeled.map((l) => l.count));

  // Labeled source towers: a composed row across the middle of the plane.
  labeled.forEach((l, idx) => {
    const n = Math.max(1, labeled.length);
    const w = 92, d = 92;
    const x = GROUND * 0.5 + (idx - (n - 1) / 2) * 150 - w / 2 + (rand() - 0.5) * 22;
    const y = GROUND * 0.46 - d / 2 + (rand() - 0.5) * 26;
    towers.push({
      key: `src-${l.i}`,
      label: l.name,
      count: l.count,
      x: Math.round(x), y: Math.round(y), w, d,
      h: heightFor(l.count, maxCount),
      minor: false,
      spotlight: idx === 0 ? 'match' : idx === 1 ? 'apply' : undefined,
    });
  });

  // Company towers: mid-rise ring around the sources.
  market.companies.forEach((c, i) => {
    const angle = (i / Math.max(1, market.companies.length)) * Math.PI * 2 + 0.35;
    const r = 200 + rand() * 60;
    const w = 54 + Math.round(rand() * 18), d = 54 + Math.round(rand() * 18);
    towers.push({
      key: `co-${i}`,
      label: null, count: c.count,
      x: Math.round(GROUND / 2 + Math.cos(angle) * r - w / 2),
      y: Math.round(GROUND / 2 + Math.sin(angle) * r * 0.72 - d / 2),
      w, d, h: 44 + Math.round(Math.sqrt(c.count) * 16),
      minor: false,
    });
  });

  // Minor skyline filler: low blocks at the edges, never labeled.
  for (let i = 0; i < 26; i++) {
    const edge = rand();
    const x = edge < 0.5 ? rand() * 150 : GROUND - 150 + rand() * 150;
    const y = rand() * GROUND;
    const w = 26 + rand() * 34, d = 26 + rand() * 34;
    towers.push({
      key: `m-${i}`, label: null, count: null,
      x: Math.round(x), y: Math.round(y), w: Math.round(w), d: Math.round(d),
      h: Math.round(16 + rand() * 44), minor: true,
    });
    // mirror some on the top/bottom edges for a fuller skyline
    if (i % 2 === 0) {
      towers.push({
        key: `m2-${i}`, label: null, count: null,
        x: Math.round(rand() * GROUND), y: Math.round(edge < 0.5 ? rand() * 120 : GROUND - 120 + rand() * 120),
        w: Math.round(w), d: Math.round(d), h: Math.round(14 + rand() * 36), minor: true,
      });
    }
  }
  return towers;
}

const fmtCount = (n: number | null) => (n == null ? '' : `${n} ${n === 1 ? 'role' : 'roles'}`);

export function CityStage({ market, scrollProgressRef, hint = true }: {
  market: MarketData;
  /** Shared ref written by a parent scroll handler; drives the camera dolly. */
  scrollProgressRef?: React.RefObject<number>;
  hint?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ id: number | null; x: number; y: number; rz: number; rx: number }>({ id: null, x: 0, y: 0, rz: 42, rx: 62 });
  const dirty = useRef(true);
  const lastProgress = useRef(-1);
  const towers = buildTowers(market);

  /* Single rAF loop that only writes when something changed (drag, scroll, idle drift). */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let driftT = 0;
    const tick = (t: number) => {
      const stage = stageRef.current;
      if (stage) {
        const p = scrollProgressRef ? Math.min(1, Math.max(0, scrollProgressRef.current ?? 0)) : 0;
        if (Math.abs(p - lastProgress.current) > 0.0005) { dirty.current = true; lastProgress.current = p; }
        // scroll-driven camera: dolly in + gentle azimuth wander (smoothstepped)
        const e = p * p * (3 - 2 * p);
        const dz = Math.round(e * 300);
        const scrollRz = -14 * Math.sin(p * Math.PI * 1.1);
        if (!reduced && !dragState.current.id) driftT = t / 1000;
        const driftRz = reduced || dragState.current.id ? 0 : Math.sin(driftT * 0.18) * 3.2;
        const rz = dragState.current.rz + scrollRz + driftRz;
        const rx = dragState.current.rx;
        stage.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
        stage.style.setProperty('--rz', `${rz.toFixed(2)}deg`);
        stage.style.setProperty('--dz', `${dz}px`);
        const scene = Math.min(3, Math.floor(p * 4.35));
        if (stage.dataset.scene !== String(scene)) stage.dataset.scene = String(scene);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scrollProgressRef]);

  /* Pointer orbit: horizontal drag rotates, vertical drag tilts (clamped). */
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch' && Math.abs(e.clientY) > 0) { /* allow pan-y; capture only on horizontal intent */ }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { id: e.pointerId, x: e.clientX, y: e.clientY, rz: dragState.current.rz, rx: dragState.current.rx };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const ds = dragState.current;
    if (ds.id !== e.pointerId) return;
    const dx = e.clientX - ds.x, dy = e.clientY - ds.y;
    ds.rz = Math.min(68, Math.max(16, ds.rz + dx * 0.22));
    ds.rx = Math.min(72, Math.max(48, ds.rx - dy * 0.14));
    ds.x = e.clientX; ds.y = e.clientY;
  }, []);

  const endDrag = useCallback((e: React.PointerEvent) => {
    if (dragState.current.id === e.pointerId) dragState.current.id = null;
  }, []);

  const ariaSummary = market.sources.length
    ? `Interactive 3D visualization of the live job pool: ${market.total} roles across ${market.sources.map((s) => `${s.name} ${s.count}`).join(', ')}. Drag to orbit.`
    : 'Interactive 3D visualization of the job market. Drag to orbit.';

  return (
    <div className="city-root" ref={rootRef}>
      <div
        className="city-viewport"
        role="img"
        aria-label={ariaSummary}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{ touchAction: 'pan-y', cursor: 'grab' }}
      >
        <div className="city-stage" ref={stageRef} style={{ ['--rx' as string]: '62deg', ['--rz' as string]: '42deg', ['--dz' as string]: '0px' }}>
          {/* ground plane */}
          <div className="city-ground" aria-hidden="true" />
          {/* grid avenues */}
          <div className="city-ave a" aria-hidden="true" />
          <div className="city-ave b" aria-hidden="true" />
          {towers.map((t) => (
            <div
              key={t.key}
              className={`city-tower${t.minor ? ' minor' : ''}`}
              data-spotlight={t.spotlight}
              style={{ left: t.x, top: t.y, width: t.w, height: t.d, ['--h' as string]: `${t.h}px` }}
            >
              <span className="city-roof" aria-hidden="true" />
              <span className="city-face f-n" aria-hidden="true" />
              <span className="city-face f-e" aria-hidden="true" />
              {t.label && (
                <span className="city-billboard">
                  <b>{t.label}</b>
                  {t.count != null && market.total > 0 && <i>{fmtCount(t.count)}</i>}
                </span>
              )}
            </div>
          ))}
          {/* the two "protagonist" markers reused across scenes */}
          <div className="city-marker m-match" aria-hidden="true"><span /></div>
          <div className="city-marker m-apply" aria-hidden="true"><span /></div>
        </div>
        <div className="city-fog" aria-hidden="true" />
      </div>
      {hint && (
        <p className="city-hint muted">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ verticalAlign: '-2px' }}>
            <path d="M3 12h18M8 7l-5 5 5 5M16 7l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>{' '}
          Drag to look around · scroll to fly in
        </p>
      )}
    </div>
  );
}
