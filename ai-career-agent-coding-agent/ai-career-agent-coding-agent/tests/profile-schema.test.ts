import { describe, it, expect } from 'vitest';
import { profileSchema } from '../lib/schemas/profile';

const validBase = {
  full_name: 'Ada Lovelace',
  target_roles: ['Backend Engineer'],
  headline: 'Engineer',
  summary: 'Building reliable systems.',
  application_email: 'Ada@Example.com',
  skills: ['Go', 'PostgreSQL'],
  experience: [{ company: 'Acme', title: 'Engineer' }],
  education: [{ institution: 'Uni', qualification: 'BSc' }],
  links: { portfolio: 'https://ada.dev' },
};

describe('profileSchema', () => {
  it('accepts a valid profile and normalizes the application email', () => {
    const out = profileSchema.parse(validBase);
    expect(out.full_name).toBe('Ada Lovelace');
    expect(out.application_email).toBe('ada@example.com');
  });

  it('allows an empty application email and maps it to null', () => {
    const out = profileSchema.parse({ ...validBase, application_email: '' });
    expect(out.application_email).toBeNull();
  });

  it('allows omitting the application email', () => {
    const { application_email } = profileSchema.parse({ ...validBase, application_email: undefined });
    expect(application_email).toBeNull();
  });

  it('rejects a malformed application email', () => {
    expect(() => profileSchema.parse({ ...validBase, application_email: 'not-an-email' })).toThrow();
  });

  it('requires at least one target role', () => {
    expect(() => profileSchema.parse({ ...validBase, target_roles: [] })).toThrow();
  });

  it('rejects a name that is too short', () => {
    expect(() => profileSchema.parse({ ...validBase, full_name: 'A' })).toThrow();
  });

  it('rejects an over-long headline', () => {
    expect(() => profileSchema.parse({ ...validBase, headline: 'x'.repeat(200) })).toThrow();
  });

  it('rejects an invalid portfolio URL', () => {
    expect(() => profileSchema.parse({ ...validBase, links: { portfolio: 'not-a-url' } })).toThrow();
  });

  it('defaults skills, experience and education to empty arrays when omitted', () => {
    const { skills, experience, education } = profileSchema.parse({
      full_name: 'Bo',
      target_roles: ['Product Manager'],
    });
    expect(skills).toEqual([]);
    expect(experience).toEqual([]);
    expect(education).toEqual([]);
  });

  it('auto-prefixes https:// for bare portfolio domains while rejecting unsafe schemes', () => {
    const parsed = profileSchema.parse({
      ...validBase,
      links: { portfolio: 'linkedin.com/in/chiamaka' },
    });
    expect(parsed.links.portfolio).toBe('https://linkedin.com/in/chiamaka');
    expect(() =>
      profileSchema.parse({ ...validBase, links: { portfolio: 'javascript:alert(1)' } }),
    ).toThrow();
  });

  it('allows more than 6 target roles (up to 20) and deduplicates case-insensitively', () => {
    const tenRoles = [
      'Business Analyst',
      'Operations Associate',
      'Project Coordinator',
      'Customer Success Associate',
      'Data Analyst',
      'Research Assistant',
      'Product Analyst',
      'Graduate Trainee',
      'Strategy Analyst',
      'business analyst',
    ];
    const parsed = profileSchema.parse({ ...validBase, target_roles: tenRoles });
    expect(parsed.target_roles).toHaveLength(9);
  });

  it('auto-strips completely blank experience and education rows (mobile empty-card bug)', () => {
    const parsed = profileSchema.parse({
      ...validBase,
      experience: [{ company: '   ', title: '', description: '' }],
      education: [
        { institution: 'Global wealth uni', qualification: 'BSc' },
        { institution: '', qualification: '  ' },
      ],
    });
    expect(parsed.experience).toEqual([]);
    expect(parsed.education).toEqual([{ institution: 'Global wealth uni', qualification: 'BSc' }]);
  });

  it('returns clear human-readable messages instead of raw Zod defaults when partially filled or over limit', () => {
    const res = profileSchema.safeParse({
      ...validBase,
      headline: 'x'.repeat(175),
      target_roles: Array.from({ length: 21 }, (_, i) => `Target Role ${i + 1}`),
      experience: [{ company: 'Acme Corp', title: '' }],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const messages = res.error.issues.map((i) => i.message).join(' | ');
      expect(messages).not.toContain('Too big:');
      expect(messages).not.toContain('Too small:');
      expect(messages).toContain('Headline must be 160 characters or fewer');
      expect(messages).toContain('Target roles: please list up to 20 roles.');
      expect(messages).toContain('Experience: enter your role title');
    }
  });
});

describe('profileSchema · not_applicable (Milestone 1)', () => {
  it('defaults to an empty list when omitted', () => {
    const { not_applicable } = profileSchema.parse(validBase);
    expect(not_applicable).toEqual([]);
  });

  it('accepts the three allowed sections', () => {
    const out = profileSchema.parse({ ...validBase, not_applicable: ['experience', 'education', 'projects'] });
    expect(out.not_applicable).toEqual(['experience', 'education', 'projects']);
  });

  it('rejects any other section name (mirrors the DB constraint)', () => {
    expect(() => profileSchema.parse({ ...validBase, not_applicable: ['name'] })).toThrow();
    expect(() => profileSchema.parse({ ...validBase, not_applicable: ['skills', 'roles'] })).toThrow();
  });
});
