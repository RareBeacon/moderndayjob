import Link from 'next/link';
import type { Metadata } from 'next';
import { JobletNavbar } from '@/components/site/joblet/Navbar';
import { JobletFooter } from '@/components/site/joblet/Footer';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'How Jobiest Works',
  description: 'Three steps between you and a working job agent: build your profile, let the agent source and prepare applications, then approve and track every send.',
  alternates: { canonical: `${SITE_URL}/how-it-works` },
};

const STEPS = [
  {
    title: 'Build your profile',
    sub: 'Tell us the truth about you, and nothing else.',
    body: [
      'A guided flow captures your experience, your skills, your target roles, and your location preferences. Every field you complete becomes a verified fact that Jobiest draws from when writing your applications.',
      'We never add what you did not tell us. If information is missing, we flag it rather than fill it in.',
      'This is not a 40-field form. It is five focused screens. Most people can complete the foundation in under 10 minutes.',
    ],
  },
  {
    title: 'Let the agent work',
    sub: 'Sourcing, scoring, and writing run in the background.',
    body: [
      'The moment your profile is live, your agent starts working. It pulls listings from verified sources like Greenhouse, Ashby, and Lever, then scores each listing against your profile.',
      'The score looks at role fit, skills overlap, location and remote preference, and seniority signals. Low-quality noise is filtered before it reaches your dashboard.',
      'For strong matches, Jobiest prepares a tailored CV and role-specific cover letter built entirely from your verified facts. No filler. No invented credentials.',
    ],
  },
  {
    title: 'Approve and track',
    sub: 'You are always the one who decides what gets sent.',
    body: [
      'Every prepared application arrives in your dashboard with a preview. You read the CV, the cover letter, and the job listing. If it looks right, you approve it. If something feels off, you skip it or edit first.',
      'After submission, your dashboard tracks every application so you always know where you stand.',
    ],
  },
];

export default function HowItWorksPage() {
  return (
    <div className="jl-page">
      <JobletNavbar />
      <main id="main">
        <section className="jl-sec blog-hero">
          <div className="jl-shell">
            <span className="jl-kicker">How it works</span>
            <h1>Three steps between you and a working job agent.</h1>
            <p>Build a truthful profile once. Let the agent handle the repetitive work. Approve every application before it sends.</p>
          </div>
        </section>
        <section className="jl-sec tint">
          <div className="jl-shell pastor-steps">
            {STEPS.map((step, i) => (
              <article className="pastor-step-card" key={step.title}>
                <span className="jl-n">{i + 1}</span>
                <h2>{step.title}</h2>
                <h3>{step.sub}</h3>
                {step.body.map((p) => <p key={p}>{p}</p>)}
              </article>
            ))}
          </div>
        </section>
        <section className="jl-sec">
          <div className="jl-shell pastor-response">
            <span className="jl-kicker">See it in action</span>
            <h2>Start free and complete your profile today.</h2>
            <p>Your matches and tools become useful as soon as the platform knows your verified facts.</p>
            <Link className="jl-btn-solid" href="/signup">Get Started Free</Link>
          </div>
        </section>
      </main>
      <JobletFooter />
    </div>
  );
}
