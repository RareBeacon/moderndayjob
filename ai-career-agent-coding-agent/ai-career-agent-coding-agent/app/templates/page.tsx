import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingShell } from '@/components/marketing/marketing-shell';
import { TemplateGallery } from '@/components/resume/TemplateGallery';
import { getOptionalUser } from '@/lib/auth';
import { RESUME_TEMPLATES } from '@/lib/resume-studio/templates';
import styles from './templates.module.css';

export const metadata: Metadata = {
  title: 'Resume & CV Templates | 30 Unique A4 Designs | Jobiest',
  description:
    'Browse 30 purpose-built ISO A4 Resume and Curriculum Vitae (CV) templates across executive, engineering, data, finance, creative, academic, and career-transition tracks with honest ATS compatibility ratings.',
};

export default async function TemplatesPage() {
  const user = await getOptionalUser();
  const totalCount = RESUME_TEMPLATES.length;
  const atsVerifiedCount = RESUME_TEMPLATES.filter((t) => t.atsCompatibility === 'verified').length;

  return (
    <MarketingShell activePath="/templates" authenticated={Boolean(user)}>
      <section className={styles.heroBand}>
        <div className={styles.container}>
          <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
            <Link href={user ? '/dashboard' : '/'}>Home</Link>
            <span aria-hidden="true">/</span>
            <Link href="/tools">Career Tools</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Resume &amp; CV Templates</span>
          </nav>

          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <div className={styles.eyebrow}>
                <span className={styles.eyebrowDot} aria-hidden="true" />
                <span>{totalCount} Templates &middot; Resume &amp; CV Ready &middot; ISO A4</span>
              </div>
              <h1 className={styles.title}>Resume Templates</h1>
              <p className={styles.lead}>
                Explore {totalCount} distinct A4 architectures built for corporate, technical, financial, creative, academic, and career-change roles. Build and export every design as either a concise <strong>Resume</strong> or a full multi-page <strong>Curriculum Vitae (CV)</strong> in selectable A4 PDF and Word DOCX, with transparent ATS parsing classification and zero data loss when switching templates.
              </p>

              <div className={styles.statsRow}>
                <span className={styles.statPill}>{totalCount} Unique Compositions</span>
                <span className={styles.statPill}>{atsVerifiedCount} ATS-Verified 1-Column</span>
                <span className={styles.statPill}>Resume &amp; Full CV Modes</span>
                <span className={styles.statPill}>Selectable A4 PDF &amp; DOCX</span>
              </div>
            </div>

            <div className={styles.heroActions} style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <Link className={styles.studioCta} href="/generate">
                Build a Resume
              </Link>
              <Link
                className={styles.studioCta}
                href="/generate?docType=cv"
                style={{ background: '#ffffff', color: '#111d35', border: '1.5px solid #cbd5e1' }}
              >
                Build a CV
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className={styles.galleryMain}>
        <div className={styles.container}>
          <TemplateGallery />
        </div>
      </div>
    </MarketingShell>
  );
}
