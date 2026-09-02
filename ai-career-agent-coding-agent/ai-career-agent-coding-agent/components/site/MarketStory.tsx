import { Reveal } from './Reveal';
import { CountUp } from './CountUp';

/**
 * MarketStory, the homepage's data moment (3D-free).
 * A live stats band with count-up numbers, followed by the four-beat story
 * as an editorial sequence with scroll reveals: alternating alignment on
 * desktop, a clean readable stack on mobile. Every number shown is real;
 * when the pool is unreachable the band says so instead of inventing data.
 */

export interface MarketData {
  total: number;
  sources: { name: string; count: number }[];
  companies: { name: string; count: number }[];
  checkedAt: string | null;
}

const SCENES = [
  {
    n: '01',
    kicker: 'The market, live',
    title: 'Your market, read every morning.',
    body: 'Public job-board APIs, ten-second timeouts, every listing normalized, hashed and deduplicated before your day starts. If one board is down, the rest still stand.',
  },
  {
    n: '02',
    kicker: 'The match',
    title: 'Your profile walks in.',
    body: 'Roles are scored against the skills you actually have. No inflated percentages, no gamified streaks, and if you are missing something, we say so plainly.',
  },
  {
    n: '03',
    kicker: 'The documents',
    title: 'Drafted from your facts only.',
    body: 'CV and cover letter cite your verified profile, nothing else. A truthfulness guard rejects any line it cannot trace back to something you actually did.',
  },
  {
    n: '04',
    kicker: 'The handover',
    title: 'Prepared. Then it waits.',
    body: 'Every application parks itself for your explicit approval. Nothing sends without your yes. That is the whole point of this product.',
  },
];

export function MarketStory({ market }: { market: MarketData }) {
  const live = market.sources.length > 0;

  return (
    <section className="mk-section mstory" id="market" aria-label="The live job market and how Jobiest meets it">
      <div className="mk-shell">
        {/* Live stats band */}
        <Reveal className="mstory-band">
          <div className="mstat">
            <span className="mlive"><i />Live</span>
            <b className="mnum"><CountUp to={live ? market.total : 0} /></b>
            <span className="mlbl">roles in the pool right now</span>
          </div>
          <div className="msrcs" aria-label="Listings by source">
            {live ? market.sources.map((s) => (
              <span className="msrc" key={s.name}><b>{s.count}</b> {s.name}</span>
            )) : (
              <span className="msrc muted">Live counts refresh every morning at 06:30</span>
            )}
          </div>
          <div className="mwhen">
            <span>Refreshed daily · 06:30 WAT</span>
            <span>{market.companies.length > 0 ? `${market.companies.length}+ companies` : 'Direct from the boards'}</span>
          </div>
        </Reveal>

        {/* The four-beat story, editorial rhythm */}
        <div className="mstory-scenes">
          {SCENES.map((s, i) => (
            <Reveal key={s.n} delay={i === 0 ? 0 : 60} className={`mscene ${i % 2 === 1 ? 'alt' : ''}`}>
              <span className="mscene-n" aria-hidden="true">{s.n}</span>
              <div>
                <span className="mk-kicker">{s.kicker}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
