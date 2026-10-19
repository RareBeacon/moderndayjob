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
          <div className={styles.container}>
            <p className={styles.eyebrow}>Template gallery</p>
            <h1>30 professional resume templates, curated from real designs.</h1>
            <p className={styles.pageLead}>
              Every template is a distinct, editable layout rebuilt from a verified Dribbble reference. Filter by what matters for your target role: ATS parsing, photo support, or column style.
            </p>
          </div>
        </header>
        <section className={`${styles.section} ${styles.sectionSoft}`} data-animate>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <h2>Browse all 30 templates</h2>
            </div>
            <TemplateGallery templates={CURATED_TEMPLATES} />
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
