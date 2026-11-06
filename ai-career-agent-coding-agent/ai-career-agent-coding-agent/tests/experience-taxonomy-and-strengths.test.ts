import { describe, expect, it } from 'vitest';
import {
  calculateDurationMonths,
  formatExperienceDuration,
  formatExperienceDateRange,
  validateExperienceDateSpan,
} from '@/lib/experience/duration';
import { profileSchema } from '@/lib/schemas/profile';

describe('Experience duration & date validation engine', () => {
  it('calculates duration correctly for calendar month boundaries', () => {
    // Jan 2023 to Jan 2023 is 1 month inclusive
    expect(calculateDurationMonths(1, 2023, 1, 2023)).toBe(1);
    // Jan 2023 to Dec 2023 is 12 months inclusive
    expect(calculateDurationMonths(1, 2023, 12, 2023)).toBe(12);
    // Jan 2022 to Jun 2023 is 18 months
    expect(calculateDurationMonths(1, 2022, 6, 2023)).toBe(18);
  });

  it('formats experience duration accurately into human-readable strings', () => {
    expect(formatExperienceDuration(1)).toBe('1 mo');
    expect(formatExperienceDuration(6)).toBe('6 mos');
    expect(formatExperienceDuration(12)).toBe('1 yr');
    expect(formatExperienceDuration(14)).toBe('1 yr 2 mos');
    expect(formatExperienceDuration(24)).toBe('2 yrs');
    expect(formatExperienceDuration(28)).toBe('2 yrs 4 mos');
  });

  it('formats date ranges correctly for ongoing and past roles', () => {
    const range1 = formatExperienceDateRange({
      start_month: 3,
      start_year: 2021,
      end_month: 8,
      end_year: 2023,
      is_current: false,
    });
    expect(range1).toBe('Mar 2021 · Aug 2023 (2 yrs 6 mos)');

    const rangeCurrent = formatExperienceDateRange({
      start_month: 1,
      start_year: 2024,
      is_current: true,
    });
    expect(rangeCurrent).toContain('Jan 2024 · Present');
  });

  it('strictly validates date spans and rejects end dates before start dates', () => {
    // Valid span
    const valid = validateExperienceDateSpan({
      start_month: 5,
      start_year: 2022,
      end_month: 10,
      end_year: 2023,
      is_current: false,
    });
    expect(valid.valid).toBe(true);

    // End date before start date
    const invalid = validateExperienceDateSpan({
      start_month: 10,
      start_year: 2023,
      end_month: 5,
      end_year: 2022,
      is_current: false,
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.error).toContain('End date cannot precede start date');

    // Current role missing start year
    const missingStart = validateExperienceDateSpan({
      is_current: true,
    });
    expect(missingStart.valid).toBe(false);
    expect(missingStart.error).toContain('Please specify start year');
  });
});

describe('Profile schema validation for skills, strengths, and structured experience', () => {
  it('accepts full profile with structured experiences and strengths', () => {
    const parsed = profileSchema.safeParse({
      full_name: 'Amara Nwosu',
      target_roles: ['Senior Product Designer', 'Design Systems Lead'],
      headline: 'Product designer focusing on accessible multi-platform design systems',
      summary: 'Over 6 years designing digital products for fintech and e-commerce companies across Africa and Europe.',
      skills: ['Figma', 'Design Systems', 'User Research', 'Prototyping', 'Accessibility'],
      strengths: ['Strategic Problem Solver', 'Proactive Communicator', 'Resilient & Adaptable'],
      strength_reflection: 'Thrive when turning ambiguous customer problems into structured, high-performing design systems.',
      experience: [
        {
          company: 'PayFlow Technologies',
          title: 'Senior Product Designer',
          location: 'Lagos, Nigeria',
          employment_type: 'Full-time',
          workplace_type: 'Hybrid',
          start_month: 3,
          start_year: 2022,
          is_current: true,
          bullets: [
            'Spearheaded design system unification across web, iOS, and Android platforms, cutting frontend rework by 40%.',
            'Conducted 35+ user testing sessions to optimize multi-currency onboarding flow.',
          ],
        },
      ],
      education: [
        {
          institution: 'University of Lagos',
          qualification: 'B.Sc. Computer Science',
        },
      ],
      links: {
        portfolio: 'https://amara.design',
      },
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.strengths).toHaveLength(3);
      expect(parsed.data.experience[0].company).toBe('PayFlow Technologies');
      expect(parsed.data.experience[0].bullets).toHaveLength(2);
      expect(parsed.data.strength_reflection).toContain('ambiguous customer problems');
    }
  });

  it('preserves backward compatibility for legacy string-based or minimal experience rows', () => {
    const parsed = profileSchema.safeParse({
      full_name: 'Legacy User',
      target_roles: ['Software Engineer'],
      skills: ['Python', 'Django'],
      experience: [
        {
          company: 'Legacy Corp',
          title: 'Backend Developer',
          description: 'Maintained monolithic API service.',
        },
      ],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.experience[0].company).toBe('Legacy Corp');
      expect(parsed.data.experience[0].is_current).toBe(false);
      expect(parsed.data.experience[0].bullets).toEqual([]);
    }
  });
});
