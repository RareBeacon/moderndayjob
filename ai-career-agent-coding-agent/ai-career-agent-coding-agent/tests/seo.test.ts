import { describe, expect, it } from 'vitest';
import { BLOG_POSTS, getBlogPost } from '../lib/seo/blog';
import { generateSeoArticleFromKeyword } from '../lib/seo/content-agent';
import { indexingApiSupportedFor } from '../lib/seo/google';
import { STRATEGIC_SEO_POSTS } from '../lib/seo/strategic-content';
import { SITE_URL } from '../lib/site';
import { isAllowedPublicSeoUrl } from '../lib/seo/public-urls';

describe('PASTOR blog content', () => {
  it('ships the five supplied launch articles with metadata', () => {
    expect(BLOG_POSTS).toHaveLength(5);
    for (const post of BLOG_POSTS) {
      expect(post.slug).toMatch(/^[a-z0-9-]+$/);
      expect(post.title.length).toBeGreaterThan(20);
      expect(post.description.length).toBeGreaterThan(40);
      expect(post.primaryKeyword.length).toBeGreaterThan(3);
      expect(getBlogPost(post.slug)?.title).toBe(post.title);
    }
  });
});

describe('Strategic SEO content engine', () => {
  it('ships 20 researched strategic posts with quality-gate fields', () => {
    expect(STRATEGIC_SEO_POSTS).toHaveLength(20);
    expect(new Set(STRATEGIC_SEO_POSTS.map((post) => post.slug)).size).toBe(20);
    for (const post of STRATEGIC_SEO_POSTS) {
      expect(post.title.toLowerCase()).toContain(post.targetKeyword.split(' ')[0].toLowerCase());
      expect(post.metaDescription.length).toBeGreaterThan(80);
      expect(post.metaDescription.length).toBeLessThanOrEqual(160);
      expect(post.contentMarkdown).toContain('## Quick answer');
      expect(post.contentMarkdown).toContain('### Example');
      expect(post.contentMarkdown).toContain(post.relatedFreeToolPath);
      expect(post.contentMarkdown).toContain('/signup');
      expect(post.faq.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('Public SEO URL allowlist', () => {
  it('excludes private, auth, jobs, dashboard and API URLs from sitemap/audit intent', () => {
    expect(isAllowedPublicSeoUrl(`${SITE_URL}/free-ats-resume-scanner`)).toBe(true);
    expect(isAllowedPublicSeoUrl(`${SITE_URL}/blog/free-ats-resume-scanner-guide`)).toBe(true);
    expect(isAllowedPublicSeoUrl(`${SITE_URL}/login`)).toBe(false);
    expect(isAllowedPublicSeoUrl(`${SITE_URL}/signup`)).toBe(false);
    expect(isAllowedPublicSeoUrl(`${SITE_URL}/jobs`)).toBe(false);
    expect(isAllowedPublicSeoUrl(`${SITE_URL}/dashboard`)).toBe(false);
    expect(isAllowedPublicSeoUrl(`${SITE_URL}/api/health`)).toBe(false);
  });
});

describe('SEO content agent safety', () => {
  it('does not fabricate unavailable keyword metrics', () => {
    const article = generateSeoArticleFromKeyword('AI job application agent');
    expect(article.url).toContain('/blog/ai-job-application-agent');
    expect(article.qualityReport.unavailableMetrics).toEqual(expect.arrayContaining(['searchVolume', 'keywordDifficulty', 'CPC', 'rankings']));
    expect(JSON.stringify(article.qualityReport)).toContain('primaryKeywordUsedNaturally');
  });
});

describe('Google indexing boundaries', () => {
  it('only treats officially supported content types as Indexing API eligible', () => {
    expect(indexingApiSupportedFor('JobPosting')).toBe(true);
    expect(indexingApiSupportedFor('BroadcastEvent')).toBe(true);
    expect(indexingApiSupportedFor('Article')).toBe(false);
    expect(indexingApiSupportedFor('BlogPosting')).toBe(false);
  });
});
