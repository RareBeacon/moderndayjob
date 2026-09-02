import type { Metadata } from 'next';
import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { FreeToolShell, RelatedTools } from '@/components/site/FreeToolShell';
import { JDAnalyzerTool } from '@/components/freetools/JDAnalyzerTool';

export const metadata: Metadata = {
  title: 'Free Job Description Analyzer, skills, keywords & gaps in seconds',
  description:
    'Paste any job description and get a structured breakdown: required skills, keywords, core responsibilities, plus which requirements your profile already matches. Free, truthful, nothing invented.',
  openGraph: {
    title: 'Free Job Description Analyzer · Jobiest',
    description:
      'Break any job listing into required skills, keywords, and responsibilities, and see what matches your profile. Free to use.',
  },
};

const STEPS = [
  { n: '1', t: 'Paste the listing', d: 'Copy the full job description, responsibilities, requirements, everything.' },
  { n: '2', t: 'We extract the essentials', d: 'Required skills, keywords, and duties, only what the listing actually states.' },
  { n: '3', t: 'See your fit', d: 'Your profile skills are compared against the requirements, so gaps are obvious.' },
];

export default async function FreeJDAnalyzerPage() {
  const user = await getUser();
  return (
    <FreeToolShell
      title="Job Description Analyzer"
      lead="Paste any listing. Get the required skills, keywords, and responsibilities as a scannable grid, plus which requirements you already match."
    >
      {/* Composition A: tool first, editorial steps below */}
      <section className="mk-section tight">
        <div className="mk-shell" style={{ maxWidth: 920 }}>
          <JDAnalyzerTool signedIn={!!user} />

          <div className="ft-steps">
            {STEPS.map((s) => (
              <div className="ft-step" key={s.n}>
                <span className="ft-step-n">{s.n}</span>
                <b>{s.t}</b>
                <p>{s.d}</p>
              </div>
            ))}
          </div>

          <div className="ft-sec">
            <h2>Why this analyzer is different</h2>
            <p>
              Most &quot;AI job analyzers&quot; guess. This one extracts only what the listing explicitly states,
              and the skill comparison against your profile is deterministic, not a black box. No invented
              requirements, no mysterious scores.
            </p>
          </div>

          <div className="ft-sec">
            <h2>More free tools</h2>
            <RelatedTools exclude="/free-job-description-analyzer" />
          </div>

          <div className="ft-sec">
            <h2>Questions</h2>
            <div className="ft-faq">
              <details>
                <summary>Is it really free?</summary>
                <p>Yes. It uses one of your daily AI credits, the free plan includes 2 every day, forever.</p>
              </details>
              <details>
                <summary>Do you store my job description?</summary>
                <p>No. The analysis is returned to you and not persisted. Your letter and CV generations in the workspace are stored as immutable versions you control.</p>
              </details>
              <details>
                <summary>Can it tell me if I&apos;ll get the job?</summary>
                <p>No, and be wary of any tool that claims to. This shows what the employer asks for and how your verified skills compare. The rest is your call.</p>
              </details>
            </div>
          </div>

          <p className="ft-cta-line">
            Ready to go further?{' '}
            <Link href="/signup" className="inline-link">Build your free profile →</Link>{' '}
            and let your AI career agent find roles that fit.
          </p>
        </div>
      </section>
    </FreeToolShell>
  );
}
