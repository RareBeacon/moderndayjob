import { describe, it, expect } from 'vitest';
import { verifyDocument } from '../lib/truthfulness/verify';
import { extractCredentials, extractMetrics, matchesAny } from '../lib/truthfulness/extract';
import type { TruthfulProfile } from '../lib/truthfulness/types';

const profile: TruthfulProfile = {
  summary: 'Engineer with 5 years building things.',
  skills: ['TypeScript', 'React', 'Node.js'],
  employers: ['Google', 'Acme Inc'],
  schools: ['University of Lagos'],
  experienceText: 'Led a team. Increased test coverage to 80%.',
};

describe('verifyDocument — entity checks', () => {
  it('passes when every claim is grounded in the profile', () => {
    const r = verifyDocument(
      {
        claimedEmployers: ['Google'],
        claimedSchools: ['University of Lagos'],
        claimedSkills: ['TypeScript'],
        text: 'Built reliable systems.',
      },
      profile,
    );
    expect(r.passed).toBe(true);
    expect(r.unsupported).toHaveLength(0);
  });

  it('flags an employer not in the profile', () => {
    const r = verifyDocument({ claimedEmployers: ['Facebook'], text: '' }, profile);
    expect(r.passed).toBe(false);
    expect(r.unsupported.some((c) => c.category === 'employer' && c.value === 'Facebook')).toBe(true);
  });

  it('flags a school not in the profile', () => {
    const r = verifyDocument({ claimedSchools: ['MIT'], text: '' }, profile);
    expect(r.passed).toBe(false);
    expect(r.unsupported.some((c) => c.category === 'school')).toBe(true);
  });

  it('matches employers fuzzily (Google ~ Google LLC)', () => {
    const r = verifyDocument({ claimedEmployers: ['Google LLC'], text: '' }, profile);
    expect(r.passed).toBe(true);
  });

  it('treats an unknown skill as suspicious, not a hard failure', () => {
    const r = verifyDocument({ claimedSkills: ['Kubernetes'], text: '' }, profile);
    expect(r.suspicious.some((c) => c.value === 'Kubernetes')).toBe(true);
    expect(r.passed).toBe(true);
  });
});

describe('verifyDocument — metric + credential fabrication', () => {
  it('accepts a metric that appears in the profile', () => {
    const r = verifyDocument({ text: 'Achieved coverage of 80%.' }, profile);
    expect(r.passed).toBe(true);
    expect(r.supported.some((c) => c.value === '80%')).toBe(true);
  });

  it('flags a fabricated percentage', () => {
    const r = verifyDocument({ text: 'Grew revenue by 50%.' }, profile);
    expect(r.passed).toBe(false);
    expect(r.unsupported.some((c) => c.value === '50%')).toBe(true);
  });

  it('flags a fabricated credential', () => {
    const r = verifyDocument({ text: 'AWS Certified Engineer.' }, profile);
    expect(r.passed).toBe(false);
    expect(r.unsupported.some((c) => c.category === 'credential')).toBe(true);
  });

  it('accepts a credential grounded in the profile', () => {
    const credProfile = { ...profile, skills: [...profile.skills, 'AWS'] };
    const r = verifyDocument({ text: 'AWS certified developer.' }, credProfile);
    expect(r.unsupported.some((c) => c.category === 'credential')).toBe(false);
  });
});

describe('extract helpers', () => {
  it('extracts percentages, multipliers, currency — not years', () => {
    expect(extractMetrics('up 80%, 3x growth, $50k, in 2019')).toEqual(
      expect.arrayContaining(['80%', '3x', '$50k']),
    );
    expect(extractMetrics('in 2019 and 2020')).toEqual([]);
  });
  it('detects credential signals', () => {
    expect(extractCredentials('I am AWS certified and hold a PMP')).toEqual(
      expect.arrayContaining(['certified', 'aws', 'pmp']),
    );
    expect(extractCredentials('no certs here')).toEqual([]);
  });
  it('matchesAny is bidirectional and treats empty as a non-claim', () => {
    expect(matchesAny('Google', ['Google LLC'])).toBe(true);
    expect(matchesAny('Google LLC', ['Google'])).toBe(true);
    expect(matchesAny('Facebook', ['Google'])).toBe(false);
    expect(matchesAny('', ['Google'])).toBe(true);
  });
});
