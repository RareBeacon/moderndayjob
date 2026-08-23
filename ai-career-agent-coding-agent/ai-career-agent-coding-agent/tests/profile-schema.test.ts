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
});
