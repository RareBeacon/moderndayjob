import { describe, it, expect } from 'vitest';
import type { AITask } from '../packages/ai/types';
import { generateDocument, toTruthfulProfile, type GenerationGateway } from '../lib/generation/service';
import type {
  AnswersOutput,
  CoverLetterOutput,
  CVOutput,
  GenerationProfile,
} from '../lib/generation/types';

const profile: GenerationProfile = {
  headline: 'Software Engineer',
  summary: 'I build things with TypeScript at Google.',
  skills: ['TypeScript', 'React'],
  targetRoles: ['Software Engineer'],
  experience: [{ company: 'Google', title: 'Engineer', description: 'Increased coverage to 80%.' }],
  education: [{ institution: 'University of Lagos', qualification: 'BSc Computer Science' }],
};

/** Mock gateway: dispatches on task id, returns a provider-shaped result. */
function mockGateway(respond: (taskId: string) => unknown): GenerationGateway {
  return {
    async run<I, O>(_task: AITask<I, O>): Promise<{ data: O; provider: string }> {
      return { data: respond(_task.id) as unknown as O, provider: 'mock' };
    },
  };
}

const honestCV: CVOutput = {
  headline: 'Software Engineer',
  summary: 'Engineer building reliable systems.',
  experiences: [
    { company: 'Google', title: 'Engineer', start: '2020', end: '2024', bullets: ['Increased coverage to 80%.'] },
  ],
  skills: ['TypeScript', 'React'],
  education: [{ institution: 'University of Lagos', qualification: 'BSc Computer Science' }],
};

describe('generateDocument, CV', () => {
  it('passes truthfulness when only profile facts are used', async () => {
    const res = await generateDocument({ kind: 'CV', profile, gateway: mockGateway(() => honestCV) });
    expect(res.report.passed).toBe(true);
    expect(res.kind).toBe('CV');
    expect(res.provider).toBe('mock');
    expect(res.content).toContain('Google');
  });

  it('fails truthfulness on a fabricated employer', async () => {
    const fabricated: CVOutput = {
      ...honestCV,
      experiences: [{ company: 'Netflix', title: 'Engineer', start: null, end: null, bullets: ['Did work.'] }],
    };
    const res = await generateDocument({ kind: 'CV', profile, gateway: mockGateway(() => fabricated) });
    expect(res.report.passed).toBe(false);
    expect(res.report.unsupported.some((c) => c.category === 'employer' && c.value === 'Netflix')).toBe(true);
  });

  it('fails truthfulness on a fabricated metric', async () => {
    const fabricated: CVOutput = {
      ...honestCV,
      experiences: [{ company: 'Google', title: 'Engineer', start: null, end: null, bullets: ['Grew revenue by 99%.'] }],
    };
    const res = await generateDocument({ kind: 'CV', profile, gateway: mockGateway(() => fabricated) });
    expect(res.report.passed).toBe(false);
    expect(res.report.unsupported.some((c) => c.value === '99%')).toBe(true);
  });
});

describe('generateDocument, cover letter', () => {
  it('passes when references are grounded', async () => {
    const out: CoverLetterOutput = {
      body: 'At Google I used TypeScript to build reliable systems for users.',
      references: { employers: ['Google'], schools: [], skills: ['TypeScript'] },
    };
    const res = await generateDocument({ kind: 'COVER_LETTER', profile, gateway: mockGateway(() => out) });
    expect(res.report.passed).toBe(true);
  });

  it('fails on a fabricated metric in the body', async () => {
    const out: CoverLetterOutput = {
      body: 'I boosted sales by 40% across the region.',
      references: { employers: ['Google'], schools: [], skills: ['TypeScript'] },
    };
    const res = await generateDocument({ kind: 'COVER_LETTER', profile, gateway: mockGateway(() => out) });
    expect(res.report.passed).toBe(false);
    expect(res.report.unsupported.some((c) => c.value === '40%')).toBe(true);
  });
});

describe('generateDocument, answers', () => {
  it('throws when questions are missing', async () => {
    await expect(
      generateDocument({ kind: 'ANSWERS', profile, gateway: mockGateway(() => ({})) }),
    ).rejects.toThrow('ANSWERS_REQUIRES_QUESTIONS');
  });

  it('returns answers with a truthfulness report', async () => {
    const out: AnswersOutput = {
      answers: [{ question: 'Why this role?', answer: 'At Google I built systems with TypeScript.' }],
      references: { employers: ['Google'], schools: [], skills: ['TypeScript'] },
    };
    const res = await generateDocument({
      kind: 'ANSWERS',
      profile,
      questions: ['Why this role?'],
      gateway: mockGateway(() => out),
    });
    expect(res.report.passed).toBe(true);
    expect(res.kind).toBe('ANSWERS');
  });
});

describe('toTruthfulProfile', () => {
  it('maps employers, schools, skills, and experience text', () => {
    const tp = toTruthfulProfile(profile);
    expect(tp.employers).toEqual(['Google']);
    expect(tp.schools).toEqual(['University of Lagos']);
    expect(tp.skills).toEqual(['TypeScript', 'React']);
    expect(tp.experienceText).toContain('80%');
  });
});
