import { z } from 'zod';

export const applicationModes = ['draft', 'assist', 'approval', 'auto'] as const;
export type ApplicationMode = (typeof applicationModes)[number];

/**
 * Schema for PUT /api/preferences (onboarding wizard step "Targets" + "Applications").
 * Centralized so the route and tests share one source of truth.
 */
export const preferencesSchema = z.object({
  remote_types: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  locations: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  employment_types: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  salary_min: z.number().int().min(0).max(1_000_000_000).nullable().default(null),
  currency: z.string().trim().min(3).max(3).default('NGN'),
  application_mode: z.enum(applicationModes).default('approval'),
  daily_target: z.number().int().min(1).max(50).default(10),
});

export type PreferencesInput = z.infer<typeof preferencesSchema>;
