import type { Metadata } from 'next';
import { MarketingShell } from '@/components/marketing/marketing-shell';
import { getUser } from '@/lib/auth';
import { TemplateGallery } from '@/components/resume/TemplateGallery';
import { CURATED_TEMPLATES } from '@/lib/resume-studio/templates';
import { SITE_URL } from '@/lib/site';
import styles from '../marketing.module.css';

export const metadata: Metadata = {
  title: 'Resume Templates: 30 Professional CV Designs',
  description: 'Browse 30 curated resume and CV templates inspired by verified Dribbble references - ATS-friendly, one-page, two-column and photo layouts with live previews.',
  alternates: { canonical: `${SITE_URL}/templates` },
};

export default async function TemplatesPage() {
  const user = await getUser();
  return (
    <MarketingShell activePath="/templates" authenticated={!!user}>
      <main className={styles.page} id="main">
        <header className={styles.pageHero} data-animate>
          <div className={styles.container} style={{ maxWidth: '1200px', padding: '0 clamp(16px, 4vw, 32px)' }}>
            <p className={styles.eyebrow} style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-muted, #5d6b85)', marginBottom: '12px' }}>CAREER TOOLS / RESUME BUILDER</p>
            <h1 style={{ fontSize: 'clamp(32px, 4vw, 52px)', lineHeight: '1.1', letterSpacing: '-0.02em', maxWidth: '20ch', margin: '0 0 12px' }}>Build a resume that gets you noticed.</h1>
            <p className={styles.pageLead} style={{ fontSize: '17px', lineHeight: '1.6', maxWidth: '65ch', margin: '0 0 32px', color: 'var(--color-muted, #5d6b85)' }}>
              Create a professional, ATS-friendly resume with your AI career assistant. Explore 30 professionally designed templates for your next application.
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '48px' }}>
              <a href="/generate" className={styles.primaryAction || ''} style={{ display: 'inline-flex', minHeight: '44px', alignItems: 'center', justifyContent: 'center', padding: '0 1.5rem', background: 'var(--color-lime, #d7f94b)', color: 'var(--color-primary-navy, #111d35)', fontWeight: 700, borderRadius: '10px', textDecoration: 'none' }}>
                Create with AI
              </a>
              <span style={{ fontSize: '14px', color: 'var(--color-muted, #5d6b85)', alignSelf: 'center' }}>Build a resume tailored to your experience and target role</span>
            </div>
          </div>
        </header>
        <section className={`${styles.section} ${styles.sectionSoft}`} data-animate style={{ padding: '40px 0', background: 'var(--color-surface-soft, #f7f9fc)' }}>
          <div className={styles.container} style={{ maxWidth: '1200px', padding: '0 clamp(16px, 4vw, 32px)' }}>
            <div className={styles.sectionHead} style={{ marginBottom: '24px', maxWidth: '720px' }}>
              <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 600, margin: '0 0 8px', color: 'var(--color-ink, #17223b)' }}>Choose your template</h2>
              <p style={{ fontSize: '15px', color: 'var(--color-muted, #5d6b85)', margin: 0 }}>Explore professionally designed templates for your next application. Showing 30 curated designs.</p>
            </div>
            <TemplateGallery templates={CURATED_TEMPLATES} />
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
