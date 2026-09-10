import { describe, expect, it } from 'vitest';
import { localResumeAIProvider } from '../lib/resume-studio/ai';
import { normalizeStudioDraft, scoreResumeDraft } from '../lib/resume-studio/draft';
import { RESUME_TEMPLATES, TEMPLATE_CATEGORIES, recommendResumeTemplates } from '../lib/resume-studio/templates';

describe('Resume Studio template library', () => {
  it('contains 50 genuinely categorized templates', () => {
    expect(RESUME_TEMPLATES).toHaveLength(50);
    for (const category of TEMPLATE_CATEGORIES) {
      expect(RESUME_TEMPLATES.filter((t) => t.category === category)).toHaveLength(10);
    }
    expect(new Set(RESUME_TEMPLATES.map((t) => t.layout)).size).toBeGreaterThan(4);
    expect(new Set(RESUME_TEMPLATES.map((t) => t.skillStyle)).size).toBeGreaterThan(3);
  });

  it('recommends modern templates for AI engineering backgrounds', () => {
    const recs = recommendResumeTemplates({ role: 'AI Engineer', yearsExperience: 3, skills: ['Python', 'LLMs', 'APIs'] });
    expect(recs).toHaveLength(3);
    expect(recs.some((t) => t.category === 'modern')).toBe(true);
  });
});

describe('Resume Studio AI safety', () => {
  it('generates experience bullets only from supplied facts', async () => {
    const result = await localResumeAIProvider.generateExperience({
      seniority: 'mid',
      experience: {
        id: 'exp-1',
        company: 'ABC Technologies',
        role: 'AI Engineer',
        roughNotes: 'I built AI agents and automation workflows for internal operations',
        tools: ['Python', 'LangChain'],
        impact: 'reduced repetitive manual work',
        bullets: [],
      },
    });
    const text = result.bullets.join(' ');
    expect(text).toContain('AI agents');
    expect(text).toContain('Python');
    expect(text).not.toMatch(/45%|revenue|Fortune|AWS Certified/);
    expect(text).not.toContain('—');
  });

  it('scores missing sections with actionable fixes', () => {
    const draft = normalizeStudioDraft({ personal: { name: 'Philip', email: '', phone: '', location: '', website: '', linkedin: '', github: '' } });
    const score = scoreResumeDraft(draft);
    expect(score.total).toBeLessThan(80);
    expect(score.fixes.length).toBeGreaterThan(0);
    expect(score.fixes.map((f) => f.step)).toContain('about');
  });
});
