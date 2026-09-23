import { z } from 'zod';

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
  .union([z.literal(''), z.string().trim().toLowerCase().max(254).email()])
  .optional()
  .transform((value) => (value ? value : null));

/**
 * Schema for PUT /api/profile. Centralized so the route and the unit tests share
 * one source of truth (CODING_AGENT.md §5, typed schemas, no business logic in UI).
 */
export const profileSchema = z.object({
  full_name: z.string().trim().min(2).max(100),
  target_roles: z.array(z.string().trim().min(2).max(80)).min(1).max(6),
  headline: z.string().trim().max(160).optional(),
  summary: z.string().trim().max(3000).optional(),
  application_email: applicationEmail,
  skills: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
  experience: z
    .array(
      z.object({
        company: z.string().trim().min(1).max(120),
        title: z.string().trim().min(1).max(120),
        description: z.string().trim().max(1500).optional(),
      }),
    )
    .max(20)
    .default([]),
  education: z
    .array(
      z.object({
        institution: z.string().trim().min(1).max(160),
        qualification: z.string().trim().min(1).max(160),
      }),
    )
    .max(10)
    .default([]),
  links: z
    .object({
      portfolio: z.string().url().optional().or(z.literal('')),
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
