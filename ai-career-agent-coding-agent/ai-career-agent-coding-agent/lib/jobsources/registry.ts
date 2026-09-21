/**
 * Job source registry (Master Implementation Package B-140/B-147).
 *
 * Adapters are loaded from the `job_sources` table (compliance metadata,
 * per-source kill switch, circuit-breaker counters) instead of hardcoded
 * env defaults. The registry records per-source outcomes: 3 consecutive
 * failures open a 1-hour cooldown (circuit breaker) so a dead board never
 * slows the pipeline; a success closes it.
 */
import { createHash } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { greenhouseAdapter, leverAdapter, ashbyAdapter, workableAdapter, smartrecruitersAdapter } from './boards';
import type { SourceAdapter, FetchLike } from './types';

export interface SourceRegistryRow {
  id: string;
  adapter: string;
  board: string;
  enabled: boolean;
  compliance: Record<string, unknown> | null;
  consecutive_failures: number;
  last_ok_at: string | null;
  cooldown_until: string | null;
}

/** Failure threshold before the circuit opens. */
export const CIRCUIT_FAILURE_THRESHOLD = 3;
/** How long an open circuit stays open. */
export const CIRCUIT_COOLDOWN_MS = 60 * 60 * 1000;

function adapterFor(row: SourceRegistryRow, fetchImpl: FetchLike): SourceAdapter | null {
  switch (row.adapter) {
    case 'greenhouse':
      return greenhouseAdapter(row.board, fetchImpl);
    case 'lever':
      return leverAdapter(row.board, fetchImpl);
    case 'ashby':
      return ashbyAdapter(row.board, fetchImpl);
    case 'workable':
      return workableAdapter(row.board, fetchImpl);
    case 'smartrecruiters':
      return smartrecruitersAdapter(row.board, fetchImpl);
    default:
      return null;
  }
}

/**
 * Load enabled, non-cooling sources from the registry and build adapters.
 * Falls back to `fallback` when the registry is empty/absent (e.g. before
 * migration 024 is applied) so ingestion never hard-fails.
 */
export async function loadRegistryAdapters(
  fetchImpl: FetchLike,
  fallback: () => SourceAdapter[],
): Promise<SourceAdapter[]> {
  let rows: SourceRegistryRow[] = [];
  try {
    const { data } = await supabaseAdmin.from('job_sources').select('*');
    rows = (data ?? []) as SourceRegistryRow[];
  } catch {
    rows = [];
  }
  if (rows.length === 0) return fallback();

  const now = Date.now();
  return rows
    .filter((r) => r.enabled)
    .filter((r) => !r.cooldown_until || new Date(r.cooldown_until).getTime() <= now)
    .map((r) => adapterFor(r, fetchImpl))
    .filter((a): a is SourceAdapter => a !== null);
}

/** Record a source outcome: success closes the circuit, failures open it. */
export async function recordSourceOutcome(sourceId: string, ok: boolean): Promise<void> {
  try {
    if (ok) {
      await supabaseAdmin.from('job_sources').update({
        consecutive_failures: 0,
        last_ok_at: new Date().toISOString(),
        cooldown_until: null,
        updated_at: new Date().toISOString(),
      }).eq('id', sourceId);
    } else {
      const { data } = await supabaseAdmin
        .from('job_sources')
        .select('consecutive_failures')
        .eq('id', sourceId)
        .maybeSingle();
      const failures = ((data as { consecutive_failures?: number } | null)?.consecutive_failures ?? 0) + 1;
      const open = failures >= CIRCUIT_FAILURE_THRESHOLD;
      await supabaseAdmin.from('job_sources').update({
        consecutive_failures: failures,
        ...(open ? { cooldown_until: new Date(Date.now() + CIRCUIT_COOLDOWN_MS).toISOString() } : {}),
        updated_at: new Date().toISOString(),
      }).eq('id', sourceId);
    }
  } catch {
    /* registry bookkeeping must never fail ingestion */
  }
}

/** Stable registry id for an adapter (mirrors the seed format). */
export function registryIdFor(adapter: SourceAdapter): string {
  return adapter.id;
}

/** Sync sha256 helper (server-only). */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
