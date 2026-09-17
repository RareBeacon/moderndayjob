import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';
import { encryptSecret } from '@packages/security/crypto';
import { assertPublicHttpsUrl } from '@/lib/agent/egress';
import { auditEvent } from '@/lib/audit';
import { z } from 'zod';

/**
 * User-managed AI credentials (Phase 7). A user can bring their own
 * OpenAI-compatible endpoint (OpenRouter, Groq, Together, a self-hosted
 * gateway on a public host, ...). Rules:
 *   - base_url MUST pass the egress allowlist (https, public host): private
 *     and metadata targets are rejected before anything is stored.
 *   - The API key is encrypted (AES-256-GCM) before storage and NEVER
 *     returned by the API; the list shows provider/model/host only.
 *   - Max 5 active credentials per user; deletes are soft (status REVOKED).
 */

const MAX_ACTIVE = 5;

const addBody = z.object({
  provider: z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9._-]+$/, 'Letters, numbers, dots, dashes only'),
  model: z.string().trim().min(1).max(120),
  base_url: z.string().trim().url().max(300),
  api_key: z.string().min(8).max(400),
});

export async function GET(req: Request) {
  const user = await requireUser({ req: req }).catch(() => null);
  if (!user) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const { data, error } = await supabaseAdmin
    .from('ai_credentials')
    .select('id, provider, model, base_url, status, key_version, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) return Response.json({ error: 'CREDENTIALS_LIST_FAILED' }, { status: 500 });
  // Never expose the key; show only the host part of the base URL.
  const credentials = (data ?? []).map((c: { id: string; provider: string; model: string; base_url: string; status: string; key_version: number; created_at: string }) => {
    let host = c.base_url;
    try { host = new URL(c.base_url).host; } catch { /* keep raw */ }
    return { id: c.id, provider: c.provider, model: c.model, host, status: c.status, key_version: c.key_version, created_at: c.created_at };
  });
  return Response.json({ credentials });
}

export async function POST(req: Request) {
  const user = await requireUser({ req: req }).catch(() => null);
  if (!user) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const rate = await enforceRateLimit(`credentials:add:${requestIp(req)}:${user.id}`, 10, '1 h');
  if (!rate.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const parsed = addBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: 'INVALID_BODY', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  }
  const { provider, model, base_url, api_key } = parsed.data;

  // Egress allowlist (B-223): reject private/loopback/metadata targets.
  try {
    assertPublicHttpsUrl(base_url);
  } catch (err) {
    return Response.json(
      { error: 'BASE_URL_BLOCKED', detail: err instanceof Error ? 'Only public https endpoints are allowed.' : 'Invalid base URL.' },
      { status: 422 },
    );
  }

  const { count } = await supabaseAdmin
    .from('ai_credentials')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'ACTIVE');
  if ((count ?? 0) >= MAX_ACTIVE) {
    return Response.json({ error: 'TOO_MANY_CREDENTIALS', detail: `Up to ${MAX_ACTIVE} active credentials.` }, { status: 409 });
  }

  const { data: inserted, error } = await supabaseAdmin
    .from('ai_credentials')
    .insert({
      user_id: user.id,
      provider,
      model,
      base_url,
      ciphertext: encryptSecret(api_key),
      status: 'ACTIVE',
      key_version: 1,
    })
    .select('id, provider, model, base_url, status, key_version, created_at')
    .single();
  if (error) return Response.json({ error: 'CREDENTIAL_ADD_FAILED' }, { status: 500 });

  void auditEvent({
    action: 'AI_CREDENTIAL_ADDED',
    resource: 'ai_credentials',
    resourceId: (inserted as { id: string }).id,
    userId: user.id,
    outcome: 'allow',
    meta: { provider, model },
  });

  let host = base_url;
  try { host = new URL(base_url).host; } catch { /* keep raw */ }
  return Response.json({ credential: { ...inserted, host } }, { status: 201 });
}

export async function DELETE(req: Request) {
  const user = await requireUser({ req: req }).catch(() => null);
  if (!user) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const rate = await enforceRateLimit(`credentials:delete:${requestIp(req)}:${user.id}`, 20, '1 h');
  if (!rate.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? '';
  if (!id) return Response.json({ error: 'MISSING_ID' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('ai_credentials')
    .update({ status: 'REVOKED', rotated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'ACTIVE');
  if (error) return Response.json({ error: 'CREDENTIAL_REVOKE_FAILED' }, { status: 500 });

  void auditEvent({
    action: 'AI_CREDENTIAL_REVOKED',
    resource: 'ai_credentials',
    resourceId: id,
    userId: user.id,
    outcome: 'allow',
  });
  return Response.json({ ok: true });
}
