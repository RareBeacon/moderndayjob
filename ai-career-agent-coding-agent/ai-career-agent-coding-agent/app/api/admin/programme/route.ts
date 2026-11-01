import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  adminErrorResponse,
  appendAdminAuditLog,
  getAdminContext,
  hasAdminPermission,
  requireAdminUser,
} from '@/lib/admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';

const manualOutboundSchema = z.object({
  track: z.enum(['JOIN_TEAM', 'PARTNER', 'COLLABORATOR']).default('PARTNER'),
  organizationName: z.string().trim().min(2).max(180),
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
    .default('US_COMPANY'),
  partnershipMarket: z.enum(['US', 'UK', 'AFRICA', 'GLOBAL', 'OTHER']).default('US'),
  applicantName: z.string().trim().min(2).max(140),
  applicantEmail: z.string().trim().email().max(200),
  roleTitle: z.string().trim().min(2).max(160).default('Employer Talent Discovery & Hiring Pilot'),
  partnershipUseCase: z.string().trim().max(240).optional(),
  organizationWebsite: z.string().trim().max(300).optional(),
  country: z.string().trim().min(2).max(100).default('United States'),
  status: z
    .enum([
      'NEW',
      'UNDER_REVIEW',
      'SHORTLISTED',
      'DISCOVERY_CALL',
      'TRIAL_60_DAY',
      'ACCEPTED',
      'PARTNERSHIP_ACTIVE',
      'ON_HOLD',
      'DECLINED',
      'ARCHIVED',
    ])
    .default('UNDER_REVIEW'),
  internalNotes: z.string().trim().max(2000).optional(),
});

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * GET  /api/admin/programme  -> Filtered Founding Team & Partnerships CRM rows + summary metrics (or CSV export).
 * POST /api/admin/programme  -> Log an outbound US/UK/institutional partnership lead into the CRM.
 */
export async function GET(req: Request) {
  let user;
  let admin;
  try {
    user = await requireAdminUser(req);
    admin = await getAdminContext(user.id, user.email ?? null);
    if (!admin) throw new Error('FORBIDDEN');
  } catch (err) {
    return adminErrorResponse(err);
  }

  const rl = await enforceRateLimit(`admin:programme:list:${user.id}`, 120, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const url = new URL(req.url);
  const track = url.searchParams.get('track')?.trim() || '';
  const status = url.searchParams.get('status')?.trim() || '';
  const department = url.searchParams.get('department')?.trim() || '';
  const market = url.searchParams.get('market')?.trim() || '';
  const q = url.searchParams.get('q')?.trim() || '';
  const format = url.searchParams.get('format')?.trim() || 'json';

  let query = supabaseAdmin
    .from('programme_applications')
    .select(
      'id, reference_code, track, department, role_title, priority_rank, arrangement, applicant_name, applicant_email, applicant_phone, country, city, linkedin_url, portfolio_url, resume_url, organization_name, organization_type, organization_website, partnership_market, partnership_use_case, availability_hours_per_week, experience_summary, motivation_statement, compensation_expectation, status, priority_band, assigned_to_user_id, review_60d_due_at, next_follow_up_at, partnership_verified, partnership_verified_at, decision_maker_contact, internal_notes, source_channel, created_at, updated_at',
    )
    .order('created_at', { ascending: false })
    .limit(500);

  if (track) query = query.eq('track', track);
  if (status) query = query.eq('status', status);
  if (department) query = query.eq('department', department);
  if (market) query = query.eq('partnership_market', market);
  if (q) {
    const safeQ = q.replace(/[%_,]/g, '');
    if (safeQ) {
      query = query.or(
        `applicant_name.ilike.%${safeQ}%,applicant_email.ilike.%${safeQ}%,organization_name.ilike.%${safeQ}%,reference_code.ilike.%${safeQ}%,role_title.ilike.%${safeQ}%`,
      );
    }
  }

  const { data: rows, error } = await query;
  if (error) {
    return Response.json({ error: 'DB_ERROR' }, { status: 500 });
  }

  const items = rows ?? [];
  const canManage = hasAdminPermission(admin, 'can_manage_programme');

  if (format === 'csv') {
    await appendAdminAuditLog({
      actorUserId: user.id,
      actorRole: admin.role,
      action: 'PROGRAMME_CRM_EXPORT_CSV',
      targetType: 'programme_applications',
      afterState: { count: items.length, filters: { track, status, department, market } },
      req,
    });

    const headers = [
      'reference_code',
      'track',
      'status',
      'priority_band',
      'department',
      'role_title',
      'arrangement',
      'applicant_name',
      'applicant_email',
      'country',
      'organization_name',
      'organization_type',
      'partnership_market',
      'partnership_verified',
      'review_60d_due_at',
      'next_follow_up_at',
      'created_at',
    ];
    const lines = [
      headers.join(','),
      ...items.map((r) => headers.map((h) => csvEscape((r as Record<string, unknown>)[h])).join(',')),
    ];
    return new Response(lines.join('\n'), {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="jobiest-programme-crm-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const { data: allRows } = await supabaseAdmin
    .from('programme_applications')
    .select('track, status, priority_band, partnership_market, partnership_verified');

  const all = allRows ?? [];
  const summary = {
    total: all.length,
    joinTeam: all.filter((r) => r.track === 'JOIN_TEAM').length,
    partners: all.filter((r) => r.track === 'PARTNER').length,
    collaborators: all.filter((r) => r.track === 'COLLABORATOR').length,
    topPriority: all.filter((r) => r.priority_band === 'TOP_PRIORITY').length,
    activeContributors: all.filter((r) => r.status === 'ACCEPTED' || r.status === 'TRIAL_60_DAY').length,
    verifiedUsPartners: all.filter(
      (r) => r.track === 'PARTNER' && r.partnership_market === 'US' && r.partnership_verified === true,
    ).length,
    verifiedUkPartners: all.filter(
      (r) => r.track === 'PARTNER' && r.partnership_market === 'UK' && r.partnership_verified === true,
    ).length,
    verifiedTotalUsUkPartners: all.filter(
      (r) =>
        r.track === 'PARTNER' &&
        (r.partnership_market === 'US' || r.partnership_market === 'UK') &&
        r.partnership_verified === true,
    ).length,
    partnerDiscoveryOrActive: all.filter(
      (r) =>
        r.track === 'PARTNER' &&
        ['DISCOVERY_CALL', 'TRIAL_60_DAY', 'PARTNERSHIP_ACTIVE'].includes(String(r.status)),
    ).length,
  };

  return Response.json({
    actorRole: admin.role,
    canManage,
    summary,
    items,
  });
}

export async function POST(req: Request) {
  let user;
  let admin;
  try {
    user = await requireAdminUser(req);
    admin = await getAdminContext(user.id, user.email ?? null);
    if (!admin || !hasAdminPermission(admin, 'can_manage_programme')) {
      throw new Error('FORBIDDEN');
    }
  } catch (err) {
    return adminErrorResponse(err);
  }

  const rl = await enforceRateLimit(`admin:programme:create:${user.id}`, 30, '1 h');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const parsed = manualOutboundSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'INVALID_BODY', issues: parsed.error.issues }, { status: 400 });
  }

  const input = parsed.data;
  const ref = `JBP-${new Date().getUTCFullYear()}-${randomBytes(3).toString('hex').toUpperCase()}`;

  const { data: created, error } = await supabaseAdmin
    .from('programme_applications')
    .insert({
      reference_code: ref,
      track: input.track,
      department: 'EXTERNAL_PARTNER',
      role_title: input.roleTitle,
      arrangement: 'STRATEGIC_PARTNERSHIP',
      applicant_name: input.applicantName,
      applicant_email: input.applicantEmail.toLowerCase(),
      country: input.country,
      organization_name: input.organizationName,
      organization_type: input.organizationType,
      organization_website: input.organizationWebsite || null,
      partnership_market: input.partnershipMarket,
      partnership_use_case: input.partnershipUseCase || input.roleTitle,
      experience_summary: input.internalNotes || `Outbound B2B partnership record for ${input.organizationName}.`,
      motivation_statement: `Outbound target logged by admin CRM (${input.partnershipMarket} market).`,
      terms_acknowledged: true,
      status: input.status,
      priority_band: input.partnershipMarket === 'US' || input.partnershipMarket === 'UK' ? 'HIGH' : 'MEDIUM',
      assigned_to_user_id: user.id,
      decision_maker_contact: `${input.applicantName} <${input.applicantEmail.toLowerCase()}>`,
      internal_notes: input.internalNotes || null,
      source_channel: 'Outbound B2B Research',
    })
    .select('id, reference_code')
    .single();

  if (error || !created) {
    return Response.json({ error: 'DB_ERROR' }, { status: 500 });
  }

  await supabaseAdmin.from('programme_application_events').insert({
    application_id: created.id,
    actor_user_id: user.id,
    event_type: 'OUTBOUND_LEAD_LOGGED',
    from_status: null,
    to_status: input.status,
    note: input.internalNotes || `Logged outbound partnership prospect (${input.organizationName})`,
  });

  await appendAdminAuditLog({
    actorUserId: user.id,
    actorRole: admin.role,
    action: 'PROGRAMME_OUTBOUND_CREATE',
    targetType: 'programme_applications',
    targetId: created.id,
    afterState: { referenceCode: created.reference_code, organizationName: input.organizationName, market: input.partnershipMarket },
    req,
  });

  return Response.json({ ok: true, id: created.id, referenceCode: created.reference_code });
}
