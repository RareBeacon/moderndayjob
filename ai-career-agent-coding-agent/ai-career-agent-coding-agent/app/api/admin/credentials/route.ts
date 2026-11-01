import { z } from 'zod';
import { requireAdminUser, adminErrorResponse } from '@/lib/admin';
import { supabaseAdmin } from '@/lib/supabase';
import { encryptSecret } from '@packages/security/crypto';
import { assertPublicHttpsUrl } from '@/lib/agent/egress';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

/** Admin-managed per-user AI credentials. The plaintext key is encrypted at
 *  rest with AES-256-GCM before touching Postgres and is NEVER returned by
 *  any endpoint or rendered on any page. `baseUrl` must pass the B-223 SSRF
 *  egress guard (public HTTPS host only; private/loopback/metadata blocked). */

const addBody = z.object({
  userId: z.guid(),
  provider: z.enum(['openrouter', 'huggingface', 'qwencloud', 'dashscope']),
  apiKey: z.string().min(10).max(500),
  model: z.string().min(1).max(200),
  baseUrl: z.string().trim().url().max(300),
});

const patchBody = z.object({
  id: z.guid(),
  action: z.enum(['REVOKE', 'ROTATE']),
  apiKey: z.string().min(10).max(500).optional(),
});

export async function POST(req: Request) {
  const rl = await enforceRateLimit(`admin:credentials:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  try {
    const admin = await requireAdminUser(req);
    const parsed = addBody.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return Response.json(
        { error: 'INVALID_BODY', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
        { status: 400 },
      );
    }
    const b = parsed.data;

    try {
      assertPublicHttpsUrl(b.baseUrl, { requireHttps: true });
    } catch {
      return Response.json(
        { error: 'BASE_URL_BLOCKED', detail: 'Only public https endpoints are allowed.' },
        { status: 422 },
      );
    }

    const { error } = await supabaseAdmin.from('ai_credentials').insert({
      user_id: b.userId,
      provider: b.provider,
      model: b.model,
      base_url: b.baseUrl,
      ciphertext: encryptSecret(b.apiKey),
      status: 'ACTIVE',
      key_version: 1,
    });
    if (error) {
      return Response.json({ error: 'CREDENTIAL_ADD_FAILED' }, { status: 409 });
    }

    await supabaseAdmin.from('admin_actions').insert({
      admin_user_id: admin.id,
      target_user_id: b.userId,
      action: 'ADD_AI_CREDENTIAL',
      metadata: { provider: b.provider, model: b.model },
    });

    return Response.json({ ok: true });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function PATCH(req: Request) {
  const rl = await enforceRateLimit(`admin:credentials:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  try {
    const admin = await requireAdminUser(req);
    const parsed = patchBody.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return Response.json({ error: 'INVALID_BODY' }, { status: 400 });
    const { id, action, apiKey } = parsed.data;

    const { data: current } = await supabaseAdmin
      .from('ai_credentials')
      .select('id,user_id,provider,model,base_url,key_version')
      .eq('id', id)
      .maybeSingle();
    if (!current) return Response.json({ error: 'NOT_FOUND' }, { status: 404 });

    if (action === 'REVOKE') {
      const { error } = await supabaseAdmin
        .from('ai_credentials')
        .update({ status: 'REVOKED', rotated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) return Response.json({ error: 'CREDENTIAL_REVOKE_FAILED' }, { status: 409 });

      await supabaseAdmin.from('admin_actions').insert({
        admin_user_id: admin.id,
        target_user_id: current.user_id,
        action: 'REVOKE_AI_CREDENTIAL',
        metadata: { provider: current.provider },
      });
      return Response.json({ ok: true, revoked: id });
    }

    if (!apiKey) return Response.json({ error: 'apiKey required for ROTATE' }, { status: 400 });
    const nextVersion = (current.key_version ?? 1) + 1;

    await supabaseAdmin
      .from('ai_credentials')
      .update({ status: 'REVOKED', rotated_at: new Date().toISOString() })
      .eq('id', id);

    const { error: insertError } = await supabaseAdmin.from('ai_credentials').insert({
      user_id: current.user_id,
      provider: current.provider,
      model: current.model,
      base_url: current.base_url,
      ciphertext: encryptSecret(apiKey),
      status: 'ACTIVE',
      key_version: nextVersion,
    });
    if (insertError) return Response.json({ error: 'CREDENTIAL_ROTATE_FAILED' }, { status: 409 });

    await supabaseAdmin.from('admin_actions').insert({
      admin_user_id: admin.id,
      target_user_id: current.user_id,
      action: 'ROTATE_AI_CREDENTIAL',
      metadata: { provider: current.provider, from: current.key_version, to: nextVersion },
    });
    return Response.json({ ok: true, rotated: id, key_version: nextVersion });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
