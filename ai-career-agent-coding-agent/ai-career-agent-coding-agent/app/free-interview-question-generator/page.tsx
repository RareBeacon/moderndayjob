import type { Metadata } from 'next';
import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { FreeToolShell, RelatedTools } from '@/components/site/FreeToolShell';
import { InterviewQuestionsTool } from '@/components/freetools/InterviewQuestionsTool';

export const metadata: Metadata = {
  title: 'Free Interview Question Generator — practice from the real listing',
  description:
    'Paste any job description and get realistic interview practice questions with what each one tests, plus preparation tips. Grounded in what the listing actually states. Free.',
  openGraph: {
    title: 'Free Interview Question Generator — ModernJob',
    description: 'Realistic practice questions derived from the actual job listing — free to use.',
  },
};

const STEPS = [
  { n: '1', t: 'Paste the listing', d: 'The one you are interviewing for — the whole thing.' },
  { n: '2', t: 'Get grounded questions', d: 'Realistic questions based on the stated requirements, each with what it tests.' },
  { n: '3', t: 'Practice out loud', d: 'Use the preparation tips, then rehearse your answers with your own real examples.' },
];

export default async function FreeInterviewQuestionsPage() {
  const user = await getUser();
  return (
    <FreeToolShell
      title="Interview Question Generator"
      lead="Paste the job description. Get realistic interview questions — each with a note on what it is really testing — plus practical preparation tips."
    >
      <section className="mk-section tight">
        <div className="mk-shell" style={{ maxWidth: 920 }}>
          <InterviewQuestionsTool signedIn={!!user} />

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
            <h2>Grounded, not generic</h2>
            <p>
              Most question banks recycle the same fifty questions for every role. These are derived from
              the listing you paste — its stated requirements and duties. The questions name what they test
              so you can practice with intent, and the tips tell you what to prepare.
            </p>
          </div>

          <div className="ft-sec">
            <h2>More free tools</h2>
            <RelatedTools exclude="/free-interview-question-generator" />
          </div>

          <div className="ft-sec">
            <h2>Questions</h2>
            <div className="ft-faq">
              <details>
                <summary>Is it really free?</summary>
                <p>Yes. It uses one of your daily AI credits — the free plan includes 2 every day, forever.</p>
              </details>
              <details>
                <summary>Are these the exact questions I&apos;ll be asked?</summary>
                <p>No — and nobody can promise that. These are realistic practice questions based on what this listing states. Treat them as a rehearsal set, not a leak.</p>
              </details>
              <details>
                <summary>Can it write my answers for me?</summary>
                <p>In your workspace, the answer generator drafts answers from your verified profile facts — but in interviews, your own words win. Practice with real examples from your experience.</p>
              </details>
            </div>
          </div>

          <p className="ft-cta-line">
            Practicing for a specific role?{' '}
            <Link href="/signup" className="inline-link">Start free →</Link>{' '}
            and keep everything — questions, drafts, applications — in one place.
          </p>
        </div>
      </section>
    </FreeToolShell>
  );
}
