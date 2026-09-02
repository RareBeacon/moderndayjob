'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * DemoReel, the homepage "video". A real video file would mean shipping
 * tens of megabytes or a third-party host; instead the product flow plays
 * as a scripted, auto-advancing animation inside a browser frame. It is
 * labeled exactly as what it is: an animated walkthrough, not a recording
 * of a user session. Reduced motion: paused, presented as a static storyboard.
 */

const SCENES = [
  {
    key: 'profile',
    step: '1',
    title: 'Build your profile once',
    line: 'Experience, skills and goals in a guided flow. This becomes the single source of truth for everything else.',
  },
  {
    key: 'scan',
    step: '2',
    title: 'We read the market every morning',
    line: 'Six boards, public APIs, normalized and deduplicated before your day starts.',
  },
  {
    key: 'match',
    step: '3',
    title: 'Matches land, honestly scored',
    line: 'Fit is measured against skills you actually have. Missing something? It says so.',
  },
  {
    key: 'docs',
    step: '4',
    title: 'Documents drafted from your facts',
    line: 'CV and cover letter cite only your verified profile. A guard rejects anything it cannot back up.',
  },
  {
    key: 'approve',
    step: '5',
    title: 'You approve. Always.',
    line: 'Every application waits for your explicit yes. Nothing ever sends itself.',
  },
];

const SCENE_MS = 4200;

export function DemoReel() {
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(true);
  const reducedRef = useRef(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => { reducedRef.current = mq.matches; setReduced(mq.matches); if (mq.matches) setPlaying(false); };
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);

  useEffect(() => {
    if (!playing || reducedRef.current) return;
    const t = setInterval(() => setScene((s) => (s + 1) % SCENES.length), SCENE_MS);
    return () => clearInterval(t);
  }, [playing]);

  const s = SCENES[scene];

  return (
    <div className="reel">
      <div className="reel-frame" role="group" aria-label="Animated product walkthrough">
        <div className="reel-chrome" aria-hidden="true">
          <span className="dot r" /><span className="dot y" /><span className="dot g" />
          <span className="reel-url">jobiest.com</span>
          <button
            type="button"
            className="reel-toggle"
            aria-pressed={playing}
            aria-label={playing ? 'Pause the walkthrough' : 'Play the walkthrough'}
            onClick={() => { if (!reduced) setPlaying((p) => !p); }}
            disabled={reduced}
            title={reduced ? 'Animations are disabled by your reduced-motion preference' : undefined}
          >
            {reduced ? '❚❚' : playing ? '❚❚' : '▶'}
          </button>
        </div>
        <div className="reel-stage" data-scene={s.key} key={s.key}>
          {/* Scene 1 · profile */}
          {s.key === 'profile' && (
            <div className="rs rs-profile">
              <div className="rs-avatar" aria-hidden="true">AL</div>
              <div className="rs-lines" aria-hidden="true"><i style={{ width: '62%' }} /><i style={{ width: '40%' }} /><i style={{ width: '78%' }} /></div>
              <div className="rs-chips" aria-hidden="true">
                <span style={{ ['--i' as string]: 0 }}>Excel</span>
                <span style={{ ['--i' as string]: 1 }}>SQL</span>
                <span style={{ ['--i' as string]: 2 }}>Operations</span>
                <span style={{ ['--i' as string]: 3 }}>Vendor mgmt</span>
              </div>
              <div className="rs-meter" aria-hidden="true"><span>Profile strength</span><b>88%</b><div><i style={{ width: '88%' }} /></div></div>
            </div>
          )}
          {/* Scene 2 · scan */}
          {s.key === 'scan' && (
            <div className="rs rs-scan">
              <div className="rs-board" style={{ ['--i' as string]: 0 }}><b>Greenhouse</b><span>90 roles</span></div>
              <div className="rs-board" style={{ ['--i' as string]: 1 }}><b>Lever</b><span>30 roles</span></div>
              <div className="rs-board" style={{ ['--i' as string]: 2 }}><b>Ashby</b><span>60 roles</span></div>
              <div className="rs-sweepline" aria-hidden="true" />
              <p className="rs-note">180 listings · deduplicated by content hash</p>
            </div>
          )}
          {/* Scene 3 · match */}
          {s.key === 'match' && (
            <div className="rs rs-match">
              <div className="rs-job" style={{ ['--i' as string]: 0 }}><span className="rs-co">Stripe</span><span>Platform Engineer</span><b className="ok">84%</b><i className="gap">+1 skill gap</i></div>
              <div className="rs-job" style={{ ['--i' as string]: 1 }}><span className="rs-co">Ramp</span><span>Ops Lead</span><b className="hi">92%</b><i>7 of 8 skills</i></div>
              <div className="rs-job" style={{ ['--i' as string]: 2 }}><span className="rs-co">Ashby</span><span>Designer</span><b className="ok">71%</b><i className="gap">+2 skill gaps</i></div>
            </div>
          )}
          {/* Scene 4 · docs */}
          {s.key === 'docs' && (
            <div className="rs rs-docs">
              <div className="rs-cv" aria-hidden="true">
                <i style={{ width: '46%', height: 13 }} /><i style={{ width: '100%' }} /><i style={{ width: '92%' }} /><i style={{ width: '96%' }} /><i style={{ width: '61%' }} />
                <em /><i style={{ width: '88%' }} /><i style={{ width: '74%' }} />
              </div>
              <div className="rs-verify" style={{ ['--i' as string]: 3 }}>
                <span className="tick" aria-hidden="true">✓</span>
                <p>Every line traces to a verified profile fact</p>
              </div>
            </div>
          )}
          {/* Scene 5 · approve */}
          {s.key === 'approve' && (
            <div className="rs rs-approve">
              <div className="rs-card">
                <span className="badge">Application ready</span>
                <h4>Ops Lead · Ramp</h4>
                <p>CV + cover letter prepared from 7 verified skills</p>
                <div className="rs-actions" aria-hidden="true"><span className="yes">Approve &amp; send</span><span className="no">Review first</span></div>
                <small>Nothing sends without you</small>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="reel-caption">
        <div className="reel-text" key={`t-${s.key}`}>
          <span className="mk-kicker">Step {s.step} of 5</span>
          <h3>{s.title}</h3>
          <p>{s.line}</p>
        </div>
        <div className="reel-dots" role="tablist" aria-label="Walkthrough scenes">
          {SCENES.map((sc, i) => (
            <button
              key={sc.key}
              type="button"
              role="tab"
              aria-selected={i === scene}
              aria-label={`Scene ${i + 1}: ${sc.title}`}
              className={i === scene ? 'on' : ''}
              onClick={() => setScene(i)}
            />
          ))}
        </div>
      </div>
      <p className="muted reel-note">An animated walkthrough of the real flow, not a recorded user session.</p>
    </div>
  );
}
