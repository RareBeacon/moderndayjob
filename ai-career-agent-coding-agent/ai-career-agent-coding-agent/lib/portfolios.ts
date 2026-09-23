import { supabaseAdmin } from '@/lib/supabase';

/**
 * Portfolio Studio domain logic (Milestone 6, owner decisions D1 + D5).
 *
 *  - Slugs: lowercase, digits and single hyphens, never all-numeric, with a
 *    random tail so a slug never leaks another user's identity. Renames keep
 *    the previous slug for a permanent redirect.
 *  - Limits are RECORD limits per plan (1/5/10/26), enforced at create time.
 *  - Content is structured data (never raw HTML). Rendering goes through
 *    React (auto-escaped) and the HTML export escapes again; the sanitizer
 *    below is the belt-and-braces layer that strips control characters and
 *    HTML syntax from user text before it is stored at all.
 */

export interface PortfolioExperience {
  company: string;
  role: string;
  period: string;
  highlights: string[];
}

export interface PortfolioProject {
  name: string;
  description: string;
  technologies: string[];
  url: string;
}

export interface PortfolioEducation {
  institution: string;
  qualification: string;
  period: string;
}

export interface PortfolioData {
  about: string;
  headline: string;
  skills: string[];
  experience: PortfolioExperience[];
  projects: PortfolioProject[];
  education: PortfolioEducation[];
  links: { website?: string; linkedin?: string; github?: string; email?: string };
}

export const PORTFOLIO_TEMPLATES = [
  { id: 'clean', name: 'Clean', description: 'A calm single column that reads like a good CV.' },
  { id: 'sidebar', name: 'Sidebar', description: 'Skills and contact in a side rail, work front and centre.' },
  { id: 'bold', name: 'Bold', description: 'Big headline and strong section rules for design-forward roles.' },
] as const;

export type PortfolioTemplateId = (typeof PORTFOLIO_TEMPLATES)[number]['id'];

export interface PortfolioRow {
  id: string;
  user_id: string;
  slug: string;
  previous_slug: string | null;
  title: string;
  template_id: string;
  data: PortfolioData;
  visibility: 'PRIVATE' | 'UNLISTED' | 'PUBLIC';
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Strip HTML syntax and control characters from a single line of user text.
 *  Rendering escapes anyway; this keeps stored data clean and makes the
 *  sanitized-HTML export trivially safe by construction. */
export function sanitizePortfolioText(input: unknown, max = 2000): string {
  if (typeof input !== 'string') return '';
  return input
    // control chars
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    // HTML syntax: tags, entities, attribute-quotes
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]|&(?![a-z]+;|#\d+;)/gi, '')
    .replace(/["`]/g, '')
    .replace(/\u2014|\u2013|\u2015/g, '-')
    .trim()
    .slice(0, max);
}

/** Escape text for safe embedding in a standalone HTML export document. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    const t = sanitizePortfolioText(v, 120);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function cleanUrl(value: unknown): string {
  const t = sanitizePortfolioText(value, 300);
  if (!/^(https?:\/\/|mailto:)/i.test(t)) return '';
  return t;
}

/** Normalize and sanitize arbitrary input into a PortfolioData object.
 *  Nothing outside this shape is ever stored. */
export function sanitizePortfolioData(input: unknown): PortfolioData {
  const raw = (input ?? {}) as Record<string, unknown>;
  return {
    about: sanitizePortfolioText(raw.about, 2000),
    headline: sanitizePortfolioText(raw.headline, 160),
    skills: cleanList(raw.skills, 40),
    experience: (Array.isArray(raw.experience) ? raw.experience : []).slice(0, 25).map((e) => {
      const ex = (e ?? {}) as Record<string, unknown>;
      return {
        company: sanitizePortfolioText(ex.company, 120),
        role: sanitizePortfolioText(ex.role, 120),
        period: sanitizePortfolioText(ex.period, 60),
        highlights: cleanList(ex.highlights, 8),
      };
    }),
    projects: (Array.isArray(raw.projects) ? raw.projects : []).slice(0, 25).map((p) => {
      const pr = (p ?? {}) as Record<string, unknown>;
      return {
        name: sanitizePortfolioText(pr.name, 120),
        description: sanitizePortfolioText(pr.description, 600),
        technologies: cleanList(pr.technologies, 12),
        url: cleanUrl(pr.url),
      };
    }),
    education: (Array.isArray(raw.education) ? raw.education : []).slice(0, 10).map((e) => {
      const ed = (e ?? {}) as Record<string, unknown>;
      return {
        institution: sanitizePortfolioText(ed.institution, 160),
        qualification: sanitizePortfolioText(ed.qualification, 160),
        period: sanitizePortfolioText(ed.period, 60),
      };
    }),
    links: {
      website: cleanUrl((raw.links as Record<string, unknown> | undefined)?.website),
      linkedin: cleanUrl((raw.links as Record<string, unknown> | undefined)?.linkedin),
      github: cleanUrl((raw.links as Record<string, unknown> | undefined)?.github),
      email: sanitizePortfolioText((raw.links as Record<string, unknown> | undefined)?.email, 160),
    },
  };
}

/** Slug base from a title: lowercase, letters/digits, single hyphens. */
export function slugBase(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'portfolio';
}

/** Generate a candidate slug: base plus a short random tail so slugs never
 *  collide or enumerate. */
export function candidateSlug(title: string): string {
  const tail = Array.from({ length: 6 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
  return `${slugBase(title)}-${tail}`;
}

/** True when no portfolio (current OR previous slug) holds this slug. */
export async function slugAvailable(slug: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('portfolios')
    .select('id')
    .or(`slug.eq.${slug},previous_slug.eq.${slug}`)
    .limit(1)
    .maybeSingle();
  return !data;
}

/** A slug that is free under both the current and previous columns. */
export async function uniqueSlug(title: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = candidateSlug(title);
    if (await slugAvailable(candidate)) return candidate;
  }
  // Practically unreachable (36^6 space); still deterministic rather than
  // throwing: full random base.
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The user's plan portfolio limit (record count, D1: 1/5/10/26). Paid plan
 *  from a live subscription period, else FREE. */
export async function portfolioLimitFor(userId: string): Promise<number> {
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('plan, current_period_end')
    .eq('user_id', userId)
    .maybeSingle();
  const live = sub && sub.current_period_end && new Date(sub.current_period_end).getTime() > Date.now();
  const planCode = (live ? (sub as { plan?: string }).plan : 'FREE') ?? 'FREE';
  const { data: plan } = await supabaseAdmin
    .from('subscription_plans')
    .select('portfolio_limit')
    .eq('code', planCode)
    .maybeSingle();
  return (plan as { portfolio_limit?: number } | null)?.portfolio_limit ?? 1;
}

export function isTemplateId(value: unknown): value is PortfolioTemplateId {
  return typeof value === 'string' && PORTFOLIO_TEMPLATES.some((t) => t.id === value);
}
