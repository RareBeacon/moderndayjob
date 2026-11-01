import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { listRankedOpportunitiesForUser } from '@/lib/radar/sync/persistence';
import { WORKPLACE_TYPES } from '@/lib/radar/types';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  workplace: z.enum(WORKPLACE_TYPES).optional(),
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .transform((v) => v.toUpperCase())
    .optional(),
  exclusivityOnly: z
    .enum(['1', 'true', '0', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  verifiedOnly: z
    .enum(['1', 'true', '0', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export async function GET(req: Request) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`radar-opps:${ip}`, 60, '1 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const url = new URL(req.url);
  const rawParams = Object.fromEntries(url.searchParams.entries());
  const parsed = querySchema.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_QUERY', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const out = await listRankedOpportunitiesForUser({
      userId: user.id,
      query: parsed.data.q ?? null,
      workplaceType: parsed.data.workplace ?? null,
      countryCode: parsed.data.country ?? null,
      exclusivityOnly: Boolean(parsed.data.exclusivityOnly),
      verifiedOnly: Boolean(parsed.data.verifiedOnly),
      limit: parsed.data.limit ?? 25,
    });

    return NextResponse.json({
      ok: true,
      migrationPending: out.migrationPending,
      opportunities: out.opportunities,
    });
  } catch {
    return NextResponse.json({ error: 'RADAR_QUERY_FAILED' }, { status: 500 });
  }
}
