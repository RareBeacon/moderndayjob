import { describe, expect, it } from 'vitest';
import {
  buildJobPostingJsonLd,
  buildPublicJobSlug,
  jobMatchesLocationHub,
  jobMatchesRoleHub,
  MIN_HUB_JOBS_FOR_INDEX,
  PUBLIC_JOB_LOCATION_HUBS,
  PUBLIC_JOB_ROLE_HUBS,
  type PublicSeoJob,
} from '@/lib/seo/public-jobs';
import { CV_EXAMPLE_ROLES } from '@/lib/seo/cv-examples';
import { RESUME_TEMPLATES } from '@/lib/resume-studio/templates';
import { buildSeoOptimizationActions } from '@/lib/seo/performance-view';
import { organizationJsonLd, websiteJsonLd } from '@/lib/seo';
import { SITE_URL } from '@/lib/site';

describe('SEO growth engines', () => {
  it('uses stable Organization and WebSite identifiers for consistent entity references', () => {
    const organization = organizationJsonLd();
    const website = websiteJsonLd();
    expect(organization['@id']).toBe(`${SITE_URL}/#organization`);
    expect(website['@id']).toBe(`${SITE_URL}/#website`);
    expect(website.publisher).toEqual({ '@id': `${SITE_URL}/#organization` });
  });

  it('retains all 30 unique resume templates and distinct CV example routes', () => {
    expect(RESUME_TEMPLATES).toHaveLength(30);
    expect(new Set(RESUME_TEMPLATES.map((template) => template.id)).size).toBe(30);
    expect(CV_EXAMPLE_ROLES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(CV_EXAMPLE_ROLES.map((role) => role.slug)).size).toBe(CV_EXAMPLE_ROLES.length);
    for (const role of CV_EXAMPLE_ROLES) {
      expect(role.bulletExamples).toHaveLength(3);
      expect(role.keywords.length).toBeGreaterThanOrEqual(5);
      expect(role.metaDescription.length).toBeGreaterThan(70);
    }
  });

  it('requires a full stable UUID in job slugs to avoid short-ID collisions', () => {
    const slug = buildPublicJobSlug({ id: '8b98bd6e-3848-48cb-a2fc-890ece1cdede', title: 'Senior Engineer', company_name: 'linear' });
    expect(slug.endsWith('8b98bd6e-3848-48cb-a2fc-890ece1cdede')).toBe(true);
  });

  it('emits strict JobPosting schema only with source dates, active status, and verified salary', () => {
    const job: PublicSeoJob = {
      id: '8b98bd6e-3848-48cb-a2fc-890ece1cdede', slug: 'senior-engineer-linear-8b98bd6e-3848-48cb-a2fc-890ece1cdede', title: 'Senior Engineer', companyName: 'Linear', department: null, careerCategory: null, seniorityLevel: 'Senior', employmentType: 'FullTime', workplaceType: 'REMOTE', locationRaw: 'Europe', city: null, stateRegion: null, countryCode: 'EU', countryCodes: ['EU'], remoteRegionRestriction: 'Europe', salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null, skillsRequired: ['TypeScript'], skillsPreferred: [], descriptionClean: 'A source verified description of this role with enough readable details to accurately describe the work and requirements.', applyUrl: 'https://jobs.example.test/apply', verificationStatus: 'VERIFIED_STANDARD', lifecycleStatus: 'ACTIVE', publishedAt: '2026-11-01T00:00:00Z', validThrough: '2026-12-31T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z',
    };
    const schema = buildJobPostingJsonLd(job);
    expect(schema?.['@type']).toBe('JobPosting');
    expect(schema).not.toHaveProperty('baseSalary');
    expect(schema).not.toHaveProperty('jobLocation');
    expect(schema?.datePosted).toBe(job.publishedAt);
    expect(buildJobPostingJsonLd({ ...job, publishedAt: null })).toBeNull();
    expect(buildJobPostingJsonLd({ ...job, lifecycleStatus: 'EXPIRED' })).toBeNull();
  });

  it('has verified role and location hub definitions and explicit thin-hub threshold', () => {
    expect(MIN_HUB_JOBS_FOR_INDEX).toBe(3);
    expect(PUBLIC_JOB_ROLE_HUBS.some((hub) => jobMatchesRoleHub({ title: 'Senior Fullstack Engineer', skillsRequired: [], department: null, careerCategory: null, seniorityLevel: null } as unknown as PublicSeoJob, hub))).toBe(true);
    const remote = PUBLIC_JOB_LOCATION_HUBS.find((hub) => hub.slug === 'remote')!;
    expect(jobMatchesLocationHub({ workplaceType: 'REMOTE' } as PublicSeoJob, remote)).toBe(true);
    expect(jobMatchesLocationHub({ workplaceType: 'HYBRID' } as PublicSeoJob, remote)).toBe(false);
  });

  it('builds GSC-only review suggestions without inventing metrics or editing pages', () => {
    const actions = buildSeoOptimizationActions([
      { date: '2026-11-01', url: 'https://jobiest.com/free-ats-resume-scanner', query: null, country: null, device: null, clicks: 2, impressions: 400, ctr: 0.005, average_position: 12 },
      { date: '2026-11-01', url: 'https://jobiest.com/blog/remote-jobs-for-nigerians', query: null, country: null, device: null, clicks: 30, impressions: 900, ctr: 0.03, average_position: 15 },
    ]);
    expect(actions).toHaveLength(3);
    expect(actions.map((action) => action.opportunity)).toContain('Improve title and description');
    expect(actions.map((action) => action.opportunity)).toContain('Add relevant internal links');
    expect(actions[0].impressions).toBe(900);
  });
});
