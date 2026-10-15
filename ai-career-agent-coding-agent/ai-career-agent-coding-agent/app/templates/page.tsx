import type { Metadata } from 'next';
import { MarketingShell } from '@/components/marketing/marketing-shell';
import { getUser } from '@/lib/auth';
import { TemplateGallery } from '@/components/resume/TemplateGallery';
import { RESUME_TEMPLATES } from '@/lib/resume-studio/templates';
import { SITE_URL } from '@/lib/site';
import styles from '../marketing.module.css';

export const metadata: Metadata = {
  title: 'Resume Templates: 70 Free Professional Designs',
  description: 'Browse 70 resume and CV templates: ATS-friendly, one-page, two-column, and photo layouts with live previews. Pick one and build in the Resume Studio.',
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
            <h1>70 professional resume templates, one verified you.</h1>
            <p className={styles.pageLead}>
              Every template is a real layout you can use in the Resume Studio with your own verified information.
              Filter by what matters for your target role: ATS parsing, photo support, or column style.
            </p>
          </div>
        </header>
        <section className={`${styles.section} ${styles.sectionSoft}`} data-animate>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <h2>Browse all 70 templates</h2>
            </div>
            <TemplateGallery templates={RESUME_TEMPLATES} />
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
