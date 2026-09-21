import { describe, expect, it } from 'vitest';
import { MASTER_UPGRADE_POSTS } from '../lib/seo/master-upgrade-content';
import { BLOG_POSTS } from '../lib/seo/blog';
import { STRATEGIC_SEO_POSTS } from '../lib/seo/strategic-content';

describe('Master Upgrade articles (Stage 4)', () => {
  it('ships exactly 20 new articles with unique slugs', () => {
    expect(MASTER_UPGRADE_POSTS).toHaveLength(20);
    expect(new Set(MASTER_UPGRADE_POSTS.map((post) => post.slug)).size).toBe(20);
    for (const post of MASTER_UPGRADE_POSTS) {
      expect(post.slug).toMatch(/^[a-z0-9-]+$/);
      expect(post.title.length).toBeGreaterThan(20);
      expect(post.metaDescription.length).toBeGreaterThan(80);
      expect(post.metaDescription.length).toBeLessThanOrEqual(160);
      expect(post.faq.length).toBeGreaterThanOrEqual(3);
      expect(post.workflow.length).toBeGreaterThanOrEqual(5);
      expect(post.checklist.length).toBeGreaterThanOrEqual(5);
      expect(post.mistakes.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('keeps rendered titles within 60 characters including the template suffix', () => {
    for (const post of MASTER_UPGRADE_POSTS) {
      expect(post.metaTitle.length).toBeLessThanOrEqual(50);
      expect(post.metaTitle.toLowerCase()).toContain(post.targetKeyword.split(' ')[0].toLowerCase());
    }
  });

  it('includes the required article components in every markdown body', () => {
    for (const post of MASTER_UPGRADE_POSTS) {
      expect(post.contentMarkdown).toContain('## Quick answer');
      expect(post.contentMarkdown).toContain('### Example');
      expect(post.contentMarkdown).toContain('## Mistakes to avoid');
      expect(post.contentMarkdown).toContain(post.relatedFreeToolPath);
      expect(post.contentMarkdown).toContain('/signup');
      expect(post.contentMarkdown).toContain('## Frequently asked questions');
    }
  });

  it('maps 3 to 5 internal links per article to real public paths', () => {
    for (const post of MASTER_UPGRADE_POSTS) {
      expect(post.internalLinks.length).toBeGreaterThanOrEqual(3);
      expect(post.internalLinks.length).toBeLessThanOrEqual(5);
      for (const link of post.internalLinks) {
        expect(link.startsWith('/')).toBe(true);
      }
    }
  });

  it('avoids cannibalization: no slug or target keyword collision with the 25 published articles', () => {
    const existingSlugs = new Set([...BLOG_POSTS.map((post) => post.slug), ...STRATEGIC_SEO_POSTS.map((post) => post.slug)]);
    const existingKeywords = new Set(
      [...BLOG_POSTS.map((post) => post.primaryKeyword.toLowerCase()), ...STRATEGIC_SEO_POSTS.map((post) => post.targetKeyword.toLowerCase())],
    );
    for (const post of MASTER_UPGRADE_POSTS) {
      expect(existingSlugs.has(post.slug)).toBe(false);
      expect(existingKeywords.has(post.targetKeyword.toLowerCase())).toBe(false);
    }
    // also unique among the new set
    const newKeywords = MASTER_UPGRADE_POSTS.map((post) => post.targetKeyword.toLowerCase());
    expect(new Set(newKeywords).size).toBe(20);
  });
});
