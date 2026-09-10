import { describe, it, expect } from 'vitest';
import type { AITask } from '../packages/ai/types';
import { generateDocument, toTruthfulProfile, type GenerationGateway } from '../lib/generation/service';
import { SAFE_FALLBACK_PROVIDER } from '../lib/generation/fallback';
import { ANSWERS_TASK, COVER_LETTER_TASK, CV_TASK } from '../lib/generation/tasks';
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

  it('falls back instead of persisting a fabricated employer', async () => {
    const fabricated: CVOutput = {
      ...honestCV,
      experiences: [{ company: 'Netflix', title: 'Engineer', start: null, end: null, bullets: ['Did work.'] }],
    };
    const res = await generateDocument({ kind: 'CV', profile, gateway: mockGateway(() => fabricated) });
    expect(res.report.passed).toBe(true);
    expect(res.provider).toBe(SAFE_FALLBACK_PROVIDER);
    expect(res.content).not.toContain('Netflix');
    expect(res.content).toContain('Google');
  });

  it('falls back instead of persisting a fabricated metric', async () => {
    const fabricated: CVOutput = {
      ...honestCV,
      experiences: [{ company: 'Google', title: 'Engineer', start: null, end: null, bullets: ['Grew revenue by 99%.'] }],
    };
    const res = await generateDocument({ kind: 'CV', profile, gateway: mockGateway(() => fabricated) });
    expect(res.report.passed).toBe(true);
    expect(res.provider).toBe(SAFE_FALLBACK_PROVIDER);
    expect(res.content).not.toContain('99%');
    expect(res.content).toContain('80%');
  });

  it('creates a deterministic CV when the provider throws', async () => {
    const failingGateway: GenerationGateway = {
      async run() { throw new Error('AI_ALL_PROVIDERS_FAILED'); },
    };
    const res = await generateDocument({ kind: 'CV', profile, gateway: failingGateway });
    expect(res.report.passed).toBe(true);
    expect(res.provider).toBe(SAFE_FALLBACK_PROVIDER);
    expect(res.content).toContain('TypeScript');
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

  it('falls back instead of persisting a fabricated metric in the body', async () => {
    const out: CoverLetterOutput = {
      body: 'I boosted sales by 40% across the region.',
      references: { employers: ['Google'], schools: [], skills: ['TypeScript'] },
    };
    const res = await generateDocument({ kind: 'COVER_LETTER', profile, gateway: mockGateway(() => out) });
    expect(res.report.passed).toBe(true);
    expect(res.provider).toBe(SAFE_FALLBACK_PROVIDER);
    expect(res.content).not.toContain('40%');
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
  it('does not verify untrusted question text as a candidate claim', async () => {
    const out: AnswersOutput = {
      answers: [{ question: 'Are you AWS Certified?', answer: 'That credential is not listed in my verified profile.' }],
      references: { employers: [], schools: [], skills: [] },
    };
    const res = await generateDocument({
      kind: 'ANSWERS',
      profile,
      questions: ['Are you AWS Certified?'],
      gateway: mockGateway(() => out),
    });
    expect(res.report.passed).toBe(true);
    expect(res.provider).toBe('mock');
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

describe('generateDocument, company-less experience (N/A regression)', () => {
  const soloProfile: GenerationProfile = {
    headline: 'AI Engineer',
    summary: 'I have over 3 years of experience in building AI agents and automations.',
    skills: ['n8n', 'LangChain', 'LangGraph'],
    targetRoles: ['AI Engineer'],
    experience: [{ company: '', title: 'AI Engineer', description: 'Developed and maintained AI agents and automations using n8n and LangChain and LangGraph.' }],
    education: [],
  };
  const naCV: CVOutput = {
    headline: 'AI Engineer',
    summary: 'Engineer with 3 years building AI agents and automations.',
    experiences: [
      { company: 'N/A', title: 'AI Engineer', start: null, end: null, bullets: ['Developed and maintained AI agents and automations.'] },
    ],
    skills: ['n8n', 'LangChain', 'LangGraph'],
    education: [],
  };
  it('passes and scrubs N/A when the model emits a placeholder company', async () => {
    const res = await generateDocument({ kind: 'CV', profile: soloProfile, gateway: mockGateway(() => naCV) });
    expect(res.report.passed).toBe(true);
    expect(res.report.unsupported).toHaveLength(0);
    expect(res.content).not.toContain('N/A');
    expect(res.content).toContain('AI Engineer');
  });
  it('passes when the model omits the company with an empty string', async () => {
    const emptyCompany = { ...naCV, experiences: [{ ...naCV.experiences[0], company: '' }] };
    const res = await generateDocument({ kind: 'CV', profile: soloProfile, gateway: mockGateway(() => emptyCompany) });
    expect(res.report.passed).toBe(true);
    expect(res.content).toContain('"company": ""');
  });
});


describe('generation task schema resilience', () => {
  it('accepts missing optional CV fields that represent absent profile facts', () => {
    const parsed = CV_TASK.schema.safeParse({
      headline: 'AI Engineer',
      summary: 'Builds AI automations from verified profile facts.',
      experiences: [{ company: null, title: '', start: undefined, end: undefined, bullets: [] }],
      skills: [],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.experiences[0].company).toBe('');
      expect(parsed.data.experiences[0].start).toBeNull();
    }
  });

  it('defaults missing reference objects for cover letters and answers', () => {
    const cover = COVER_LETTER_TASK.schema.safeParse({ body: 'A'.repeat(140) });
    const answers = ANSWERS_TASK.schema.safeParse({ answers: [{ question: 'Q', answer: 'A' }] });
    expect(cover.success).toBe(true);
    expect(answers.success).toBe(true);
    if (cover.success) expect(cover.data.references).toEqual({ employers: [], schools: [], skills: [] });
    if (answers.success) expect(answers.data.references).toEqual({ employers: [], schools: [], skills: [] });
  });
});
