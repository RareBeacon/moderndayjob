import { describe, expect, it } from 'vitest';
import { BLOG_POSTS, getBlogPost } from '../lib/seo/blog';
import { generateSeoArticleFromKeyword } from '../lib/seo/content-agent';
import { indexingApiSupportedFor } from '../lib/seo/google';

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
