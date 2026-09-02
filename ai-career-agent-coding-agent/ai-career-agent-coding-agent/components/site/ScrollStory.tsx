'use client';
import { useEffect, useRef } from 'react';
import { CityStage, type MarketData } from './CityStage';

/**
 * ScrollStory, the cinematic heart of the homepage (per the build spec:
 * scroll = camera control). A tall track pins a full-viewport stage; scroll
 * progress dollies the camera through the 3D market city while four short
 * scenes narrate what Jobiest actually does. Every claim in the captions is
 * backed by real system behavior.
 *
 * Reduced motion: the pin dissolves (CSS) into a static, fully readable
 * section; the scroll listener becomes a no-op.
 */
export function ScrollStory({ market }: { market: MarketData }) {
  const trackRef = useRef<HTMLElement>(null);
  const progressRef = useRef(0);
  const capRefs = useRef<(HTMLDivElement | null)[]>([]);
  const railRefs = useRef<(HTMLLIElement | null)[]>([]);
  const barRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const captions = capRefs.current;
    const rails = railRefs.current;
    const bar = barRef.current;

    const update = () => {
      const rect = track.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const p = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
      progressRef.current = p;

      // caption crossfade by segment
      const seg = p * 4;
      for (let i = 0; i < captions.length; i++) {
        const el = captions[i];
        if (!el) continue;
        const dist = Math.abs(seg - (i + 0.5));
        const o = Math.max(0, 1 - dist * 1.45);
        el.style.opacity = String(o);
        el.style.transform = `translateY(${(1 - o) * 14}px)`;
        el.classList.toggle('on', o > 0.5);
      }
      for (let i = 0; i < rails.length; i++) rails[i]?.classList.toggle('on', seg >= i && seg < i + 1.6);
      if (bar) bar.style.transform = `scaleY(${p})`;
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const countsLine = market.sources.length
    ? `${market.total} live roles across ${market.sources.length} boards right now, read directly from their public APIs.`
    : 'The market refreshes every morning at 06:30, straight from the boards\u2019 public APIs.';

  const scenes = [
    {
      kicker: 'Scene 01 · The market, live',
      title: 'This is your market, this morning.',
      body: countsLine + ' Every tower is a real source; its height is its live listing count. Nothing here is a stock number.',
    },
    {
      kicker: 'Scene 02 · The approach',
      title: 'We read the boards, politely.',
      body: 'Public APIs, ten-second timeouts, every listing normalized and content-hashed so nothing duplicates. If one board is down, the rest of the city still stands.',
    },
    {
      kicker: 'Scene 03 · The match',
      title: 'Your profile walks in.',
      body: 'Roles are scored against the skills you actually have. No inflated percentages, no gamified streaks, and if you\u2019re missing something, we say so plainly.',
    },
    {
      kicker: 'Scene 04 · The application',
      title: 'Prepared. Then it waits.',
      body: 'CV and cover letter drafted solely from your verified facts, then parked. Nothing sends without your explicit approval. That is the whole point of this product.',
    },
  ];

  return (
    <section className="story" ref={trackRef} aria-label="How Jobiest meets the market, a scroll-driven story">
      <div className="story-sticky">
        <CityStage market={market} scrollProgressRef={progressRef} hint={false} />
        <div className="story-captions" aria-live="off">
          {scenes.map((s, i) => (
            <div className="story-cap" ref={(el) => { capRefs.current[i] = el; }} key={i} aria-hidden={false}>
              <span className="story-kicker">{s.kicker}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
        <ol className="story-rail" aria-hidden="true">
          {scenes.map((_, i) => (
            <li key={i} ref={(el) => { railRefs.current[i] = el; }}><span>{String(i + 1).padStart(2, '0')}</span></li>
          ))}
          <span className="story-rail-bar" ref={barRef as never} />
        </ol>
        <p className="city-hint muted story-hint">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ verticalAlign: '-2px' }}>
            <path d="M3 12h18M8 7l-5 5 5 5M16 7l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>{' '}
          Drag to look around · keep scrolling to fly in
        </p>
      </div>
    </section>
  );
}
