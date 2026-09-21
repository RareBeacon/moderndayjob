import type { Metadata } from 'next';
import { JobletNavbar } from '@/components/site/joblet/Navbar';
import { JobletFooter } from '@/components/site/joblet/Footer';
import { TemplateGallery } from '@/components/resume/TemplateGallery';
import { RESUME_TEMPLATES } from '@/lib/resume-studio/templates';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Resume Templates: 70 Free Professional Designs',
  description: 'Browse 70 resume and CV templates: ATS-friendly, one-page, two-column, and photo layouts with live previews. Pick one and build in the Resume Studio.',
  alternates: { canonical: `${SITE_URL}/templates` },
};

export default function TemplatesPage() {
  return (
    <div className="jl-page">
      <JobletNavbar />
      <main id="main">
        <section className="jl-sec blog-hero">
          <div className="jl-shell">
            <span className="jl-kicker">Template gallery</span>
            <h1>70 professional resume templates, one verified you.</h1>
            <p>
              Every template is a real layout you can use in the Resume Studio with your own verified information.
              Filter by what matters for your target role: ATS parsing, photo support, or column style.
            </p>
          </div>
        </section>
        <section className="jl-sec tint">
          <div className="jl-shell">
            <TemplateGallery templates={RESUME_TEMPLATES} />
          </div>
        </section>
      </main>
      <JobletFooter />
    </div>
  );
}
