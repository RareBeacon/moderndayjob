import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingShell } from '@/components/marketing/marketing-shell';
import { TemplateGallery } from '@/components/resume/TemplateGallery';
import { getUser } from '@/lib/auth';
import { RESUME_TEMPLATES } from '@/lib/resume-studio/templates';
import styles from './templates.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Resume Templates | 30 Unique A4 Designs | Jobiest',
  description:
    'Browse 30 purpose-built ISO A4 resume templates across executive, engineering, data, finance, creative, academic, and career-transition tracks with honest ATS compatibility ratings.',
};

export default async function TemplatesPage() {
  const user = await getUser().catch(() => null);
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
            <span aria-current="page">Resume Templates</span>
          </nav>

          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <div className={styles.eyebrow}>
                <span className={styles.eyebrowDot} aria-hidden="true" />
                <span>{totalCount} Templates &middot; ISO A4 Library</span>
              </div>
              <h1 className={styles.title}>Resume Templates</h1>
              <p className={styles.lead}>
                Explore {totalCount} distinct A4 resume architectures built for corporate, technical, financial, creative, academic, and career-change roles. Every preview reflects the real PDF engine, with transparent ATS parsing classification and instant template switching that preserves all of your profile data.
              </p>

              <div className={styles.statsRow}>
                <span className={styles.statPill}>{totalCount} Unique Compositions</span>
                <span className={styles.statPill}>{atsVerifiedCount} ATS-Verified 1-Column</span>
                <span className={styles.statPill}>{totalCount - atsVerifiedCount} Two-Column Visual</span>
                <span className={styles.statPill}>Selectable A4 PDF &amp; DOCX</span>
              </div>
            </div>

            <div className={styles.heroActions}>
              <Link className={styles.studioCta} href="/generate">
                Open Resume Studio
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
