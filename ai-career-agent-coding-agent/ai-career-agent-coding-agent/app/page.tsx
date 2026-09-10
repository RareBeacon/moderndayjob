import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site';
import { supabaseAdmin } from '@/lib/supabase';
import { JobletNavbar } from '@/components/site/joblet/Navbar';
import { JobletHero } from '@/components/site/joblet/Hero';
import { JobletTools, JobletHow, JobletPricing, JobletAbout, JobletMission, JobletFaq } from '@/components/site/joblet/Sections';
import { JobletBanner } from '@/components/site/joblet/Banner';
import { JobletFooter } from '@/components/site/joblet/Footer';

/* Homepage data is ISR: rebuilt on deploy, then refreshed at most every 5
   minutes, so the live-listings note shows recent counts without hammering
   the database on every visit. */
export const revalidate = 300;

export const metadata: Metadata = {
  alternates: { canonical: SITE_URL },
};

/** Live market counts from the job pool. Honest on failure: empty means we
 *  show nothing rather than inventing numbers. */
async function getLiveMarket(): Promise<{ total: number; sources: string[] }> {
  try {
    const { data, error } = await supabaseAdmin.from('jobs').select('source');
    if (error || !data) return { total: 0, sources: [] };
    const bySource = new Map<string, number>();
    for (const row of data as { source: string }[]) {
      bySource.set(row.source, (bySource.get(row.source) ?? 0) + 1);
    }
    const sources = [...bySource.keys()]
      .map((s) => s.charAt(0) + s.slice(1).toLowerCase())
      .sort((a, b) => (bySource.get(b.toUpperCase()) ?? 0) - (bySource.get(a.toUpperCase()) ?? 0))
      .slice(0, 3);
    return { total: data.length, sources };
  } catch {
    return { total: 0, sources: [] };
  }
}

export default async function HomePage() {
  const market = await getLiveMarket();

  return (
    <div className="jl-page">
      <main id="main">
        <section className="jl-hero">
          <JobletNavbar />
          <JobletHero liveTotal={market.total} liveSources={market.sources} />
        </section>
        <JobletHow />
        <JobletPricing />
        <JobletAbout />
        <JobletMission />
        <JobletFaq />
        <JobletTools />
        <JobletBanner />
      </main>
      <JobletFooter />
    </div>
  );
}
