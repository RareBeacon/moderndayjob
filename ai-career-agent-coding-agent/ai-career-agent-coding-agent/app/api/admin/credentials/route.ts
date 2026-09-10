import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { encryptSecret } from '@packages/security/crypto';
import { z } from 'zod';

/* Admin-only management of per-user encrypted AI provider keys.
 * - POST   : add a new encrypted credential (insert-only, key_version 1).
 * - PATCH  : revoke (mark REVOKED) or rotate (revoke old, issue key_version+1).
 * Secrets are encrypted at rest; ciphertext is never returned to the browser. */

const addBody = z.object({
  userId: z.string().uuid(),
  provider: z.enum(['openrouter', 'huggingface']),
  apiKey: z.string().min(10).max(500),
  model: z.string().min(1).max(200),
  baseUrl: z.string().url(),
});

const actionBody = z.object({
  id: z.string().uuid(),
  action: z.enum(['REVOKE', 'ROTATE']),
  apiKey: z.string().min(10).max(500).optional(),
});

async function requireAdmin() {
  const admin = await requireUser().catch(() => null);
  if (!admin) throw new Error('UNAUTHENTICATED');
  const { data } = await supabaseAdmin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', admin.id)
    .maybeSingle();
  if (!data) throw new Error('FORBIDDEN');
  return admin;
}

function handleError(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'INTERNAL';
  if (message === 'UNAUTHENTICATED') return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (message === 'FORBIDDEN') return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
  if (message === 'NOT_FOUND') return Response.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message ?? 'BAD_REQUEST' }, { status: 400 });
  return Response.json({ error: message }, { status: 409 });
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const b = addBody.parse(await req.json());
    const ciphertext = encryptSecret(b.apiKey);
    const { error } = await supabaseAdmin.from('ai_credentials').insert({
      user_id: b.userId,
      provider: b.provider,
      model: b.model,
      base_url: b.baseUrl,
      ciphertext,
      status: 'ACTIVE',
      key_version: 1,
    });
    if (error) return Response.json({ error: error.message }, { status: 409 });
    await supabaseAdmin.from('admin_actions').insert({
      admin_user_id: admin.id,
      target_user_id: b.userId,
      action: 'ADD_AI_CREDENTIAL',
      metadata: { provider: b.provider, model: b.model },
    });
    return Response.json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const admin = await requireAdmin();
    const b = actionBody.parse(await req.json());

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('ai_credentials')
      .select('*')
      .eq('id', b.id)
      .maybeSingle();
    if (fetchError || !existing) return Response.json({ error: 'NOT_FOUND' }, { status: 404 });

    if (b.action === 'REVOKE') {
      const { error } = await supabaseAdmin
        .from('ai_credentials')
        .update({ status: 'REVOKED', rotated_at: new Date().toISOString() })
        .eq('id', b.id);
      if (error) return Response.json({ error: error.message }, { status: 409 });
      await supabaseAdmin.from('admin_actions').insert({
        admin_user_id: admin.id,
        target_user_id: existing.user_id,
        action: 'REVOKE_AI_CREDENTIAL',
        metadata: { provider: existing.provider, key_version: existing.key_version },
      });
      return Response.json({ ok: true, revoked: b.id });
    }

    /* ROTATE: revoke the current key and issue a fresh key_version + 1. */
    if (!b.apiKey) return Response.json({ error: 'apiKey is required to rotate' }, { status: 400 });
    const nextVersion = (existing.key_version ?? 0) + 1;
    const { error: revokeError } = await supabaseAdmin
      .from('ai_credentials')
      .update({ status: 'REVOKED', rotated_at: new Date().toISOString() })
      .eq('id', b.id);
    if (revokeError) return Response.json({ error: revokeError.message }, { status: 409 });
    const { error: insertError } = await supabaseAdmin.from('ai_credentials').insert({
      user_id: existing.user_id,
      provider: existing.provider,
      model: existing.model,
      base_url: existing.base_url,
      ciphertext: encryptSecret(b.apiKey),
      status: 'ACTIVE',
      key_version: nextVersion,
    });
    if (insertError) return Response.json({ error: insertError.message }, { status: 409 });
    await supabaseAdmin.from('admin_actions').insert({
      admin_user_id: admin.id,
      target_user_id: existing.user_id,
      action: 'ROTATE_AI_CREDENTIAL',
      metadata: { provider: existing.provider, from: existing.key_version, to: nextVersion },
    });
    return Response.json({ ok: true, rotated: b.id, key_version: nextVersion });
  } catch (error) {
    return handleError(error);
  }
}
