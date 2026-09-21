import type { Metadata } from 'next';
import Link from 'next/link';
import { JobletNavbar } from '@/components/site/joblet/Navbar';
import { JobletFooter } from '@/components/site/joblet/Footer';
import { SITE_URL } from '@/lib/site';
import { breadcrumbJsonLd, jsonLdTag } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Help and Support',
  description:
    'Get help with Jobiest: how the free tools work, what approval mode means, billing in Naira, refunds within 7 days, and how to reach support.',
  alternates: { canonical: `${SITE_URL}/help` },
  openGraph: {
    title: 'Help and Support · Jobiest',
    description: 'Answers about free tools, approval mode, pricing in Naira, refunds, and how to contact support.',
    images: ['/images/og-card.jpg'],
  },
};

const TOPICS: { title: string; items: { q: string; a: string }[] }[] = [
  {
    title: 'Getting started',
    items: [
      {
        q: 'Do I need an account to use the free tools?',
        a: 'No. Every tool runs without an account. You can preview each full result, and on the rule-based ATS scanner you can copy it too. Copy, download and save on the AI tools unlock with a free account.',
      },
      {
        q: 'Does the free plan expire?',
        a: 'No. The free plan is permanent and needs no card. It includes 3 AI generations in total to try the AI writer, 10 career-tool uses a day, the application agent, and the tracker.',
      },
      {
        q: 'What does approval mode mean?',
        a: 'Jobiest prepares matches, documents and applications, but nothing is ever sent without you reviewing and approving it first. That applies to every plan, including agent mode.',
      },
    ],
  },
  {
    title: 'Documents and truthfulness',
    items: [
      {
        q: 'Will Jobiest invent experience to make my CV stronger?',
        a: 'Never. Every document is generated only from facts you provide or verified profile facts. Missing facts are flagged, not filled in. If a generated draft contains an unsupported claim, the truthfulness check rejects it before it is saved.',
      },
      {
        q: 'Where do the job listings come from?',
        a: 'Jobiest reads verified job sources such as Greenhouse, Ashby and Lever. Listings are scored against your profile so you see why each role was recommended.',
      },
    ],
  },
  {
    title: 'Billing',
    items: [
      {
        q: 'What currency am I billed in?',
        a: 'All plans are billed in Nigerian Naira (₦). Basic is ₦5,000 a month, Premium is ₦10,000, and Max is ₦20,000. The price you see is the price you pay.',
      },
      {
        q: 'How do refunds work?',
        a: 'If you just paid and have not used the plan, you can request a refund within 7 days. Full details are on the refund policy page.',
      },
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="jl-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdTag(breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Help', path: '/help' }]))} />
      <JobletNavbar />
      <main id="main">
        <section className="jl-sec blog-hero">
          <div className="jl-shell">
            <span className="jl-kicker">Help</span>
            <h1>Short answers to real questions.</h1>
            <p>How the tools work, what approval mode means, and where your money goes.</p>
          </div>
        </section>

        {TOPICS.map((topic) => (
          <section className="jl-sec" key={topic.title}>
            <div className="jl-shell jl-faq-wrap">
              <div className="jl-sec-head">
                <h2>{topic.title}</h2>
              </div>
              <div className="faq">
                {topic.items.map((item) => (
                  <details className="faq-item" key={item.q}>
                    <summary className="faq-q">{item.q}</summary>
                    <div className="faq-a open"><div><p>{item.a}</p></div></div>
                  </details>
                ))}
              </div>
            </div>
          </section>
        ))}

        <section className="jl-sec tint">
          <div className="jl-shell pastor-response">
            <span className="jl-kicker">Still stuck?</span>
            <h2>Email us. A human replies.</h2>
            <p>Write to <a href="mailto:support@jobiest.com">support@jobiest.com</a> and describe what happened. A real person reads and answers every message.</p>
            <div className="ft2-actions left" style={{ display: 'flex', gap: 12, marginTop: 18 }}>
              <a className="jl-btn-solid" href="mailto:support@jobiest.com">Email support</a>
              <Link className="jl-btn-outline" href="/refund">Refund policy</Link>
            </div>
          </div>
        </section>
      </main>
      <JobletFooter />
    </div>
  );
}
