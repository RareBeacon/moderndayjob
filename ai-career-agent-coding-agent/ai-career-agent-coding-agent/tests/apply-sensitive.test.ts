import { describe, expect, it } from 'vitest';
import { classifyQuestion, partitionQuestions, GUIDANCE } from '../lib/apply/sensitive';

/**
 * Sensitive-question policy (B-184): work authorization, salary expectations,
 * demographic, criminal-history, legal-agreement and disability questions are
 * NEVER auto-answered. They are surfaced to the user with guidance instead.
 */

describe('classifyQuestion (B-184)', () => {
  it.each([
    ['Are you legally authorized to work in the United States?', 'work_authorization'],
    ['Will you now or in the future require sponsorship?', 'work_authorization'],
    ['What is your visa status?', 'work_authorization'],
    ['What are your salary expectations?', 'salary_expectations'],
    ['Desired compensation?', 'salary_expectations'],
    ['What is your earliest start date?', 'salary_expectations'],
    ['What is your gender?', 'demographic'],
    ['Do you identify as Hispanic or Latino?', 'demographic'],
    ['Are you a veteran?', 'demographic'],
    ['Have you ever been convicted of a crime?', 'criminal_history'],
    ['Do you consent to a background check?', 'criminal_history'],
    ['Do you agree to the arbitration agreement?', 'legal_agreements'],
    ['Do you accept the IP assignment terms?', 'legal_agreements'],
    ['Do you have a disability?', 'disability'],
    ['Do you require an accommodation to perform this role?', 'disability'],
  ])('%s is sensitive (%s)', (q, category) => {
    const match = classifyQuestion(q);
    expect(match).not.toBeNull();
    expect(match?.category).toBe(category);
  });

  it.each([
    ['Why do you want to work here?'],
    ['Describe a project you are proud of.'],
    ['Which of these tools have you used: React, Vue, Svelte?'],
    ['How many years of experience do you have with Python?'],
    ['What is your LinkedIn profile URL?'],
  ])('%s is auto-fillable', (q) => {
    expect(classifyQuestion(q)).toBeNull();
  });

  it('every category carries plain-language guidance', () => {
    for (const guidance of Object.values(GUIDANCE)) {
      expect(guidance.length).toBeGreaterThan(10);
      expect(guidance).toMatch(/[.]/);
    }
  });
});

describe('partitionQuestions (B-184)', () => {
  it('separates auto-fillable from sensitive, preserving order', () => {
    const { auto, sensitive } = partitionQuestions([
      'Why this company?',
      'What are your salary expectations?',
      'Describe your experience.',
      'Are you authorized to work in Canada?',
    ]);
    expect(auto).toEqual(['Why this company?', 'Describe your experience.']);
    expect(sensitive.map((s) => s.question)).toEqual([
      'What are your salary expectations?',
      'Are you authorized to work in Canada?',
    ]);
    expect(sensitive[0].match.category).toBe('salary_expectations');
    expect(sensitive[1].match.category).toBe('work_authorization');
  });

  it('an all-sensitive list leaves nothing to auto-fill', () => {
    const { auto, sensitive } = partitionQuestions(['Your salary expectations?', 'Your gender?']);
    expect(auto).toHaveLength(0);
    expect(sensitive).toHaveLength(2);
  });
});
