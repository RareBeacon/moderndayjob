import { env } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Internal health endpoint (spec 52). Reports component status WITHOUT
 * exposing credentials, hostnames, or internal diagnostics. Always returns
 * HTTP 200 so uptime monitors do not false-positive while components degrade;
 * `ok` reflects the critical path (database), and `degraded` flags advisory
 * components (AI gateway, email).
 */

async function checkDb(): Promise<'ok' | 'error'> {
  try {
    const { error } = await supabaseAdmin
      .from('profiles')
      .select('user_id', { count: 'exact', head: true })
      .limit(1);
    return error ? 'error' : 'ok';
  } catch {
    return 'error';
  }
}

async function checkAiGateway(): Promise<'ok' | 'error' | 'not_configured'> {
  const base = env.OLLAMA_BASE_URL.trim();
  if (!base) return 'not_configured';
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}/healthz`, {
      signal: AbortSignal.timeout(2500),
    });
    return res.ok ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

export async function GET() {
  const [database, aiGateway] = await Promise.all([checkDb(), checkAiGateway()]);
  const email = env.RESEND_API_KEY ? 'configured' : 'not_configured';
  const degraded = database !== 'ok' || aiGateway === 'error' || email === 'not_configured';
  return Response.json({
    ok: database === 'ok',
    degraded,
    service: 'ai-career-agent',
    time: new Date().toISOString(),
    checks: { database, ai_gateway: aiGateway, email },
  });
}
