import { z } from 'zod';
import { isSafeHttpUrl } from '@/lib/security/safe-url';

/**
 * Application email validation.
 *
 * Product rule (AGENTS.md §6 / DECISIONS.md D-001): this is an APPLICATION EMAIL
 * ONLY, no inbox access, no OAuth, no stored credentials. The value is a contact
 * address the user supplies, so it may be stored in cleartext.
 *
 * Allows empty (user has not provided one yet); otherwise must be a valid,
 * lower-cased email up to 254 characters.
 */
const applicationEmail = z
  .union([
    z.literal(''),
    z
      .string()
      .trim()
      .toLowerCase()
      .max(254, 'Application email must be 254 characters or fewer.')
      .email('Application email must be a valid email address.'),
  ])
  .optional()
  .transform((value) => (value ? value : null));

function normalizePortfolioUrlInput(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // If user typed a bare domain on mobile (e.g. "linkedin.com/in/ada" or "www.ada.dev")
  // without a scheme, prefix https:// while leaving explicit schemes ("javascript:", etc.)
  // untouched so unsafe schemes and non-domains ("not-a-url") still fail validation.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function stripEmptyExperienceRows(raw: unknown): unknown {
  if (!Array.isArray(raw)) return raw;
  return raw.filter((item) => {
    if (!item || typeof item !== 'object') return true;
    const rec = item as Record<string, unknown>;
    const company = typeof rec.company === 'string' ? rec.company.trim() : '';
    const title = typeof rec.title === 'string' ? rec.title.trim() : '';
    const description = typeof rec.description === 'string' ? rec.description.trim() : '';
    return Boolean(company || title || description);
  });
}

function stripEmptyEducationRows(raw: unknown): unknown {
  if (!Array.isArray(raw)) return raw;
  return raw.filter((item) => {
    if (!item || typeof item !== 'object') return true;
    const rec = item as Record<string, unknown>;
    const institution = typeof rec.institution === 'string' ? rec.institution.trim() : '';
    const qualification = typeof rec.qualification === 'string' ? rec.qualification.trim() : '';
    return Boolean(institution || qualification);
  });
}

function cleanStringList(raw: unknown): unknown {
  if (!Array.isArray(raw)) return raw;
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') {
      out.push(item);
      continue;
    }
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Schema for PUT /api/profile. Centralized so the route and the unit tests share
 * one source of truth (CODING_AGENT.md §5, typed schemas, no business logic in UI).
 */
export const profileSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters.')
    .max(100, 'Full name must be 100 characters or fewer.'),
  target_roles: z.preprocess(
    cleanStringList,
    z
      .array(
        z
          .string()
          .trim()
          .min(2, 'Each target role must be at least 2 characters.')
          .max(80, 'Each target role must be 80 characters or fewer.'),
      )
      .min(1, 'Add at least one target role (for example: Product Designer, Data Analyst).')
      .max(20, 'Target roles: please list up to 20 roles.'),
  ),
  headline: z
    .string()
    .trim()
    .max(160, 'Headline must be 160 characters or fewer. Move longer details into Professional summary.')
    .optional(),
  summary: z
    .string()
    .trim()
    .max(3000, 'Professional summary must be 3,000 characters or fewer.')
    .optional(),
  application_email: applicationEmail,
  skills: z.preprocess(
    cleanStringList,
    z
      .array(
        z
          .string()
          .trim()
          .min(1, 'Skill cannot be empty.')
          .max(60, 'Each skill must be 60 characters or fewer.'),
      )
      .max(60, 'Skills: please list up to 60 skills.')
      .default([]),
  ),
  strengths: z.preprocess(
    cleanStringList,
    z
      .array(
        z
          .string()
          .trim()
          .min(1, 'Strength cannot be empty.')
          .max(80, 'Each strength must be 80 characters or fewer.'),
      )
      .max(40, 'Personal strengths: please list up to 40 strengths.')
      .default([]),
  ),
  strength_reflection: z
    .string()
    .trim()
    .max(2000, 'Strength reflection must be 2,000 characters or fewer.')
    .optional()
    .default(''),
  experience: z.preprocess(
    stripEmptyExperienceRows,
    z
      .array(
        z.object({
          id: z.string().optional(),
          company: z
            .string()
            .trim()
            .min(1, 'Experience: enter the company name (or remove the unfinished entry).')
            .max(120, 'Experience: company name must be 120 characters or fewer.'),
          title: z
            .string()
            .trim()
            .min(1, 'Experience: enter your role title (or remove the unfinished entry).')
            .max(120, 'Experience: role title must be 120 characters or fewer.'),
          description: z
            .string()
            .trim()
            .max(3000, 'Experience: description must be 3,000 characters or fewer.')
            .optional(),
          location: z.string().trim().max(120).optional().nullable(),
          employment_type: z.string().trim().max(60).optional().nullable(),
          workplace_type: z.string().trim().max(60).optional().nullable(),
          start_month: z.number().int().min(1).max(12).optional().nullable(),
          start_year: z.number().int().min(1950).max(2100).optional().nullable(),
          end_month: z.number().int().min(1).max(12).optional().nullable(),
          end_year: z.number().int().min(1950).max(2100).optional().nullable(),
          is_current: z.boolean().optional().default(false),
          bullets: z.array(z.string().trim().min(1).max(1000)).optional().default([]),
        }),
      )
      .max(20, 'Experience: you can list up to 20 roles.')
      .default([]),
  ),
  education: z.preprocess(
    stripEmptyEducationRows,
    z
      .array(
        z.object({
          institution: z
            .string()
            .trim()
            .min(1, 'Education: enter the institution name (or remove the unfinished entry).')
            .max(160, 'Education: institution name must be 160 characters or fewer.'),
          qualification: z
            .string()
            .trim()
            .min(1, 'Education: enter your qualification or degree (or remove the unfinished entry).')
            .max(160, 'Education: qualification must be 160 characters or fewer.'),
        }),
      )
      .max(10, 'Education: you can list up to 10 entries.')
      .default([]),
  ),
  links: z
    .object({
      portfolio: z.preprocess(
        normalizePortfolioUrlInput,
        z
          .string()
          .trim()
          .url('Portfolio URL must be a valid web link (for example: https://yourportfolio.com).')
          .max(300, 'Portfolio URL must be 300 characters or fewer.')
          .refine((v) => isSafeHttpUrl(v, 300), 'Portfolio URL must start with https:// or http://.')
          .optional()
          .or(z.literal('')),
      ),
    })
    .default({}),
  /**
   * Sections the user marked not applicable (Milestone 1): they count as
   * addressed for onboarding completion without inventing data. Only the
   * three sections a person may genuinely not have are allowed, mirroring
   * the career_profiles.not_applicable_values constraint (migration 036).
   */
  not_applicable: z
    .array(z.enum(['experience', 'education', 'projects']))
    .max(3)
    .default([]),
});

export type ProfileInput = z.infer<typeof profileSchema>;
