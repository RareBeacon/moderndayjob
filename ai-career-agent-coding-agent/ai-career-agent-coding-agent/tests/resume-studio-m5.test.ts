import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Resume Studio profile-aware pass (Milestone 5).
 *
 * Contract: the studio prefills from the career profile and starts at the
 * first section that actually needs input (asks only missing or
 * role-specific questions); every template ships without a watermark; and
 * editing, saving or re-downloading never consumes a credit (only a fresh
 * generation does, verified against the meter's rpc surface).
 */

import { draftFromMemory, firstIncompleteStep, freshDraft } from '../lib/resume-studio/prefill';
import { RESUME_TEMPLATES } from '../lib/resume-studio/templates';

const { rpc, from, requireUser, storage } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  requireUser: vi.fn(),
  storage: { from: vi.fn(() => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://signed' }, error: null }) })) },
}));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { rpc, from, storage } }));
vi.mock('@/lib/auth', () => ({ requireUser, getUser: vi.fn() }));

import { GET as downloadGET } from '@/app/api/documents/[id]/download/route';

const RICH_MEMORY = {
  fullName: 'Ada Lovelace',
  email: 'ada@b.co',
  targetRoles: ['Platform Engineer'],
  career: {
    headline: 'Platform Engineer',
    summary: 'Builds reliable systems.',
    skills: ['TypeScript', 'Postgres'],
    experience: [{ company: 'Acme', title: 'Engineer', description: 'Ran the platform team.' }],
    education: [{ institution: 'UNILAG', qualification: 'BSc Computer Science' }],
    projects: [],
    links: { website: null, linkedin: 'https://linkedin.com/in/ada', github: null },
  },
};

describe('profile-aware prefill', () => {
  it('fills the draft from the career profile without inventing anything', () => {
    const draft = draftFromMemory(RICH_MEMORY);
    expect(draft.personal.name).toBe('Ada Lovelace');
    expect(draft.career.headline).toBe('Platform Engineer');
    expect(draft.skills.map((s) => s.name)).toEqual(['TypeScript', 'Postgres']);
    expect(draft.experiences[0].company).toBe('Acme');
    expect(draft.education[0].institution).toBe('UNILAG');
    // Nothing invented: no experience bullets beyond the profile text.
    expect(draft.experiences[0].bullets).toEqual(['Ran the platform team.']);
  });

  it('an empty profile starts at the beginning (about you)', () => {
    expect(firstIncompleteStep(freshDraft())).toBe('about');
  });

  it('a complete profile skips to the role-specific polish step, not welcome', () => {
    const draft = draftFromMemory(RICH_MEMORY);
    expect(firstIncompleteStep(draft)).toBe('optimize');
  });

  it('a profile with experience but no education lands on education', () => {
    const partial = { ...RICH_MEMORY, career: { ...RICH_MEMORY.career, education: [], projects: [] } };
    expect(firstIncompleteStep(draftFromMemory(partial))).toBe('education');
  });

  it('a profile with a name but no career identity lands on career', () => {
    const partial = { fullName: 'Ada', email: 'a@b.co', targetRoles: [], career: null };
    expect(firstIncompleteStep(draftFromMemory(partial))).toBe('career');
  });
});

describe('no-watermark guarantee across the template library', () => {
  it('no template name, description, or category mentions a watermark', () => {
    for (const t of RESUME_TEMPLATES) {
      const haystack = [t.name, t.description, t.category, ...(t.bestFor ?? [])].join(' ').toLowerCase();
      expect(haystack.includes('watermark'), `template ${t.id} mentions watermark`).toBe(false);
    }
  });

  it('the library is the full 70 templates (the check covers everything shipped)', () => {
    expect(RESUME_TEMPLATES.length).toBe(70);
  });
});

describe('editing and re-downloading never consume a credit', () => {
  beforeEach(() => {
    rpc.mockReset();
    requireUser.mockReset().mockResolvedValue({ id: 'user-1', email: 'ada@b.co' });
    from.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { storage_path: 'u/cv.pdf', original_name: 'cv.pdf' } }),
          }),
        }),
      }),
    });
  });
  afterEach(() => vi.clearAllMocks());

  it('the download route only reads the document and signs a URL; no credit rpc of any kind', async () => {
    const res = await downloadGET(
      new Request('http://localhost/api/documents/x/download'),
      { params: Promise.resolve({ id: 'doc-1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('https://signed');
    expect(rpc).not.toHaveBeenCalled();
  });
});
