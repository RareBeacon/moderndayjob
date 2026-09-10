import { describe, expect, it } from 'vitest';
import { FREE_TOOLS } from '../lib/free-tools/config';
import { generateFreeToolResult } from '../lib/free-tools/generator';

describe('Free Tools 2.0 configuration', () => {
  it('defines the exact ten public free tools on one shared config', () => {
    expect(FREE_TOOLS.map((tool) => tool.id).sort()).toEqual([
      'ats-resume-scanner',
      'career-path-explorer',
      'cover-letter-writer',
      'follow-up-email-writer',
      'interview-question-generator',
      'job-description-analyzer',
      'linkedin-headline-builder',
      'resume-summary-generator',
      'salary-insights',
      'skills-matcher',
    ].sort());
  });

  it('requires context-specific questions and account-gated unlocks for every tool', () => {
    for (const tool of FREE_TOOLS) {
      expect(tool.questions.length).toBeGreaterThanOrEqual(3);
      expect(tool.questions.some((q) => q.required)).toBe(true);
      expect(tool.requiresAuthenticationToUnlock).toBe(true);
      expect(tool.supportsCopy).toBe(true);
      expect(tool.supportsDownload).toBe(true);
      expect(tool.supportsSave).toBe(true);
      expect(tool.progressMessages.length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('Free Tools 2.0 generation safety', () => {
  it('generates personalized cover letters without invented metrics or em dashes', async () => {
    const result = await generateFreeToolResult('cover-letter-writer', {
      targetRole: 'AI Engineer',
      company: 'ABC Technologies',
      jobDescription: 'We need an AI Engineer with Python, APIs, automation and LLM experience to build internal workflow tools.',
      background: 'I have 3 years of experience building AI agents and automation systems.',
      skills: ['Python', 'APIs', 'Automation', 'LLMs'],
      motivation: 'I like practical automation work',
      achievement: 'I built AI agents for business workflows',
      tone: 'Professional',
    });
    expect(result.resultText).toContain('ABC Technologies');
    expect(result.resultText).toContain('AI Engineer');
    expect(result.resultText).toContain('Python');
    expect(result.resultText).not.toMatch(/45%|revenue|Fortune 500|AWS Certified/);
    expect(result.resultText).not.toContain('—');
  });

  it('turns weak salary data into an honest no-estimate result', async () => {
    const result = await generateFreeToolResult('salary-insights', {
      targetRole: 'Role That Should Not Exist In Pool',
      location: 'Atlantis',
      pastedListings: 'This job post has responsibilities but no salary or pay range.',
    });
    expect(result.resultText.toLowerCase()).toContain('no estimates');
    expect(result.resultText).not.toContain('—');
  });
});
