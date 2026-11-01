import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { getOptionalUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';
import { sendEmail } from '@/lib/email/resend';
import { SITE_URL } from '@/lib/site';
import { IMMEDIATE_PRIORITY_ROLES, PROGRAMME_TRACKS } from '@/lib/programme/catalog';

const urlOptional = z
  .string()
  .trim()
  .max(400)
  .optional()
  .transform((v) => {
    if (!v) return null;
    if (/^https?:\/\//i.test(v)) return v;
    return `https://${v}`;
  });

const applySchema = z.object({
  track: z.enum(['JOIN_TEAM', 'PARTNER', 'COLLABORATOR']),
  department: z
    .enum([
      'CONTENT_MEDIA',
      'SALES_BD',
      'STRATEGY_OPS',
      'TECH_PRODUCT',
      'COMMUNITY_CS',
      'PARTNERSHIPS_EXPANSION',
      'EXTERNAL_PARTNER',
    ])
    .optional(),
  roleTitle: z.string().trim().min(2).max(160),
  arrangement: z.enum([
    'INTERNSHIP',
    'VOLUNTEER',
    'PART_TIME',
    'FREELANCE',
    'FULL_TIME',
    'STRATEGIC_PARTNERSHIP',
  ]),
  applicantName: z.string().trim().min(2).max(140),
  applicantEmail: z.string().trim().email().max(200),
  applicantPhone: z.string().trim().max(40).optional(),
  country: z.string().trim().min(2).max(100),
  city: z.string().trim().max(100).optional(),
  linkedinUrl: urlOptional,
  portfolioUrl: urlOptional,
  resumeUrl: urlOptional,
  organizationName: z.string().trim().max(180).optional(),
  organizationType: z
    .enum([
      'US_COMPANY',
      'UK_COMPANY',
      'RECRUITMENT_AGENCY',
      'UNIVERSITY',
      'TECH_COMMUNITY',
      'CAREER_ORG',
      'HR_CONSULTING',
      'MARKETING_AGENCY',
      'STARTUP_COMMUNITY',
      'TRAINING_CERTIFICATION',
      'OTHER',
    ])
    .optional(),
  organizationWebsite: urlOptional,
  partnershipMarket: z.enum(['US', 'UK', 'AFRICA', 'GLOBAL', 'OTHER']).optional(),
  partnershipUseCase: z.string().trim().max(240).optional(),
  availabilityHoursPerWeek: z.coerce.number().int().min(1).max(80).optional(),
  experienceSummary: z.string().trim().min(20).max(3000),
  motivationStatement: z.string().trim().min(20).max(3000),
  compensationExpectation: z.string().trim().max(300).optional(),
  sourceChannel: z.string().trim().max(120).optional(),
  termsAcknowledged: z.literal(true),
  // Honeypot anti-bot field: must remain blank.
  websiteTrap: z.string().max(200).optional(),
});

function buildReferenceCode(): string {
  const year = new Date().getUTCFullYear();
  const token = randomBytes(3).toString('hex').toUpperCase();
  return `JBP-${year}-${token}`;
}

/**
 * POST /api/founding-programme/apply (Public endpoint for https://jobiest.com/apply).
 *
 * Accepts applications for Join the Team, Become a Partner, and Become a Collaborator,
 * persists structured CRM records into public.programme_applications + initial
 * timeline event in public.programme_application_events, and dispatches a
 * branded acknowledgement email best-effort.
 */
export async function POST(req: Request) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`programme:apply:${ip}`, 8, '1 h');
  if (!rl.allowed) {
    return Response.json(
      { error: 'RATE_LIMITED', message: 'Too many submissions from this connection. Please try again later.' },
      { status: 429 },
    );
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = applySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      {
        error: 'INVALID_SUBMISSION',
        message: 'Please check all required fields and try again.',
        issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      },
      { status: 400 },
    );
  }

  const input = parsed.data;
  if (input.websiteTrap && input.websiteTrap.trim().length > 0) {
    return Response.json({ ok: true, referenceCode: buildReferenceCode() });
  }

  const optionalUser = await getOptionalUser().catch(() => null);
  const priorityMatch = IMMEDIATE_PRIORITY_ROLES.find(
    (r) => r.role.toLowerCase() === input.roleTitle.toLowerCase(),
  );
  const priorityRank = priorityMatch?.rank ?? null;
  const priorityBand =
    priorityRank !== null && priorityRank <= 5
      ? 'TOP_PRIORITY'
      : input.track === 'PARTNER' && (input.partnershipMarket === 'US' || input.partnershipMarket === 'UK')
        ? 'HIGH'
        : priorityRank !== null
          ? 'HIGH'
          : 'MEDIUM';

  const ipHash = ip ? createHash('sha256').update(ip).digest('hex').slice(0, 32) : null;
  const referenceCode = buildReferenceCode();

  const { data: inserted, error } = await supabaseAdmin
    .from('programme_applications')
    .insert({
      reference_code: referenceCode,
      user_id: optionalUser?.id ?? null,
      track: input.track,
      department: input.track === 'PARTNER' ? 'EXTERNAL_PARTNER' : input.department ?? priorityMatch?.department ?? 'STRATEGY_OPS',
      role_title: input.roleTitle,
      priority_rank: priorityRank,
      arrangement: input.track === 'PARTNER' ? 'STRATEGIC_PARTNERSHIP' : input.arrangement,
      applicant_name: input.applicantName,
      applicant_email: input.applicantEmail.toLowerCase(),
      applicant_phone: input.applicantPhone || null,
      country: input.country,
      city: input.city || null,
      linkedin_url: input.linkedinUrl ?? null,
      portfolio_url: input.portfolioUrl ?? null,
      resume_url: input.resumeUrl ?? null,
      organization_name: input.organizationName || null,
      organization_type: input.organizationType ?? null,
      organization_website: input.organizationWebsite ?? null,
      partnership_market: input.partnershipMarket ?? null,
      partnership_use_case: input.partnershipUseCase || null,
      availability_hours_per_week: input.availabilityHoursPerWeek ?? null,
      experience_summary: input.experienceSummary,
      motivation_statement: input.motivationStatement,
      compensation_expectation: input.compensationExpectation || null,
      terms_acknowledged: true,
      status: 'NEW',
      priority_band: priorityBand,
      decision_maker_contact: input.track === 'PARTNER' ? `${input.applicantName} <${input.applicantEmail.toLowerCase()}>` : null,
      source_channel: input.sourceChannel || null,
      ip_hash: ipHash,
    })
    .select('id, reference_code, created_at')
    .single();

  if (error || !inserted) {
    return Response.json(
      { error: 'SAVE_FAILED', message: 'We could not record your submission right now. Please try again shortly.' },
      { status: 500 },
    );
  }

  try {
    await supabaseAdmin.from('programme_application_events').insert({
      application_id: inserted.id,
      actor_user_id: optionalUser?.id ?? null,
      event_type: 'SUBMITTED',
      from_status: null,
      to_status: 'NEW',
      note: `Submitted via jobiest.com/apply (${input.track} / ${input.roleTitle})`,
      metadata: {
        referenceCode: inserted.reference_code,
        priorityBand,
        priorityRank,
      },
    });
  } catch {
    /* non-blocking */
  }

  const trackLabel = PROGRAMME_TRACKS.find((t) => t.code === input.track)?.title ?? input.track;
  const firstName = input.applicantName.split(' ')[0] || 'there';
  void sendEmail({
    to: input.applicantEmail,
    subject: `Application received (${inserted.reference_code}) - Jobiest Founding & Partnerships Programme`,
    html: `<div style="font-family:Inter,Arial,sans-serif;max-width:580px;margin:0 auto;padding:24px;color:#0f172a;line-height:1.6;">
      <p style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#1d4ed8;font-weight:700;margin:0 0 8px;">Jobiest Founding Team &amp; Partnerships</p>
      <h1 style="font-size:22px;margin:0 0 12px;">Thank you, ${firstName}. We have received your submission.</h1>
      <p>Your submission for <strong>${trackLabel}</strong> (${input.roleTitle}) has been logged in our Founding Team &amp; Strategic Partnerships CRM.</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin:16px 0;font-size:14px;">
        <div><strong>Reference code:</strong> ${inserted.reference_code}</div>
        <div><strong>Track:</strong> ${trackLabel}</div>
        <div><strong>Role / Focus:</strong> ${input.roleTitle}</div>
      </div>
      <p>Our team reviews applications and partnership proposals weekly against our immediate priorities and reaches out directly to schedule discovery or contributor onboarding conversations.</p>
      <p style="margin-top:20px;"><a href="${SITE_URL}/apply" style="color:#1d4ed8;font-weight:600;">Return to Jobiest Founding &amp; Partnerships Portal</a></p>
    </div>`,
    text: `Hello ${firstName},\n\nThank you for applying to the Jobiest Founding Team & Strategic Partnerships Programme.\n\nReference code: ${inserted.reference_code}\nTrack: ${trackLabel}\nRole / Focus: ${input.roleTitle}\n\nOur team reviews submissions weekly and reaches out directly to qualified candidates and partners.\n\n${SITE_URL}/apply`,
    replyTo: 'support@jobiest.com',
  }).catch(() => {});

  return Response.json({
    ok: true,
    referenceCode: inserted.reference_code,
    priorityBand,
    createdAt: inserted.created_at,
  });
}
