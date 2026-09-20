import Link from 'next/link';
import type { Metadata } from 'next';
import { JobletNavbar } from '@/components/site/joblet/Navbar';
import { JobletFooter } from '@/components/site/joblet/Footer';

/**
 * Public onboarding guide (no login required). Linked from the welcome
 * email and the help section. Every CTA points at a real product surface.
 */
export const metadata: Metadata = {
  title: 'Getting started with Jobiest',
  description:
    'Set up your profile once and get more value from Jobiest: profile, CV, job preferences, applications, the AI agent and account security.',
};

const STEPS: Array<{
  n: number;
  title: string;
  body: React.ReactNode;
  cta?: { href: string; label: string };
}> = [
  {
    n: 1,
    title: 'Complete your profile',
    body: (
      <>
        <p>Your career profile is the factual source for everything Jobiest does: matching, CV generation, cover letters and applications.</p>
        <p>Add your name, professional title, location, experience, skills, education and job preferences. Everything stays private until you choose to use it.</p>
      </>
    ),
    cta: { href: '/profile', label: 'Complete my profile' },
  },
  {
    n: 2,
    title: 'Build your CV',
    body: (
      <>
        <p>Use the guided CV builder to turn your profile into a clean, recruiter-ready document. Because it starts from verified facts, your CV stays truthful: no invented experience, ever.</p>
        <p>You can export and reuse it anywhere.</p>
      </>
    ),
    cta: { href: '/generate', label: 'Create my CV' },
  },
  {
    n: 3,
    title: 'Set your job preferences',
    body: (
      <>
        <p>Tell Jobiest which roles you want, where you want them, and how senior you are:</p>
        <ul>
          <li>Target roles and keywords</li>
          <li>Locations and remote preference</li>
          <li>Experience level</li>
        </ul>
        <p>Preferences shape your recommendations, so a few minutes here saves hours later.</p>
      </>
    ),
    cta: { href: '/profile', label: 'Set my preferences' },
  },
  {
    n: 4,
    title: 'Bring the job you want',
    body: (
      <>
        <p>Jobiest does not post jobs. When you find a role you want, paste the job link and the details, and your agent prepares the whole application.</p>
        <p>Every application is prepared from your verified facts and tracked in one dashboard.</p>
      </>
    ),
    cta: { href: '/applications', label: 'Start an application' },
  },
  {
    n: 5,
    title: 'Prepare applications with the AI agent',
    body: (
      <>
        <p>For a job you care about, Jobiest drafts a tailored CV, cover letter and answers using only your verified facts.</p>
        <p>Important boundaries that keep you in control:</p>
        <ul>
          <li>Salary, work authorization and other sensitive questions are never auto-answered</li>
          <li>Nothing is ever sent without your approval</li>
          <li>You can review and edit every draft first</li>
        </ul>
      </>
    ),
    cta: { href: '/generate', label: 'Prepare an application' },
  },
  {
    n: 6,
    title: 'Track everything in one place',
    body: (
      <>
        <p>Every application, document and status update lives in one dashboard with a full timeline, using an application email that keeps your personal inbox clean.</p>
      </>
    ),
    cta: { href: '/applications', label: 'Open my applications' },
  },
  {
    n: 7,
    title: 'Secure your account',
    body: (
      <>
        <p>Three minutes now, no headaches later:</p>
        <ul>
          <li>Use a strong, unique password</li>
          <li>Keep your email address verified</li>
          <li>Turn on two-factor authentication with an authenticator app such as Google Authenticator</li>
        </ul>
      </>
    ),
    cta: { href: '/settings', label: 'Secure my account' },
  },
];

export default function GettingStartedPage() {
  return (
    <>
      <JobletNavbar />
      <main className="jl-page">
        <div style={{ maxWidth: 780, margin: '0 auto', padding: '48px 20px 72px' }}>
          <p className="jl-eyebrow">GUIDE</p>
          <h1 style={{ fontSize: 'clamp(30px, 5vw, 40px)', letterSpacing: '-0.03em', margin: '8px 0 10px' }}>
            Getting started with Jobiest
          </h1>
          <p className="muted" style={{ fontSize: 17, maxWidth: '56ch' }}>
            Set up your profile once and get more value from Jobiest. Seven short steps, about fifteen minutes.
          </p>

          <ol className="guide-steps">
            {STEPS.map((step) => (
              <li key={step.n} className="guide-step">
                <div className="guide-num" aria-hidden="true">{step.n}</div>
                <div className="guide-body">
                  <h2>{step.title}</h2>
                  {step.body}
                  {step.cta ? (
                    <p>
                      <Link className="jl-btn-solid" href={step.cta.href}>
                        {step.cta.label}
                      </Link>
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>

          <div className="guide-done">
            <h2 style={{ fontSize: 22, margin: '0 0 8px' }}>That is it. Your next opportunity is here.</h2>
            <p className="muted" style={{ margin: '0 0 16px' }}>
              Questions at any point? Write to <a href="mailto:support@jobiest.com">support@jobiest.com</a> or use the{' '}
              <Link href="/support">support page</Link>.
            </p>
            <Link className="jl-btn-solid" href="/signup">
              Create my free account
            </Link>
          </div>
        </div>
      </main>
      <JobletFooter />
    </>
  );
}
