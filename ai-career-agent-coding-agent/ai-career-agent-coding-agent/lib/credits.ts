import { supabaseAdmin } from '@/lib/supabase';

/**
 * Credit ledger client (Enterprise upgrade Milestone 2).
 *
 * Server-side wrappers around the migration-037 SQL functions. The ledger
 * is the future entitlement authority (monthly matrix, credits that never
 * expire and accumulate per owner decision D4), but it PARALLEL-RUNS with
 * the legacy usage_daily / usage_lifetime counters: nothing gates on the
 * ledger until ENTITLEMENTS_LEDGER=true, while the daily pipeline populates
 * period grants so the ledger can be observed for a clean cycle first.
 *
 * Semantics (owner decision D3):
 *  - reserve: hold one credit while an operation is in flight.
 *  - consume: spend the held credit on confirmed completion (idempotent).
 *  - release: give the hold back on failure or cancellation.
 */

export type CreditResource = 'DOCUMENT' | 'AUTO_APPLY';

/** The ledger balance (grants minus consumptions) has nothing spendable. */
export class CreditExhaustedError extends Error {
  constructor(resource: CreditResource) {
    super(`CREDIT_EXHAUSTED:${resource}`);
    this.name = 'CreditExhaustedError';
  }
}

/**
 * Enforcement flag, read at call time. ARMED BY DEFAULT since the 2026-09-23
 * go-live (owner directive "make it go live"): the monthly credit matrix
 * (D1) is the real limit for documents and auto-applies. Set
 * ENTITLEMENTS_LEDGER=false to disarm (parallel-run observation mode).
 */
export function ledgerEnabled(): boolean {
  const v = process.env.ENTITLEMENTS_LEDGER;
  return v !== 'false';
}

export async function reserveCredit(userId: string, resource: CreditResource, reference: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc('credit_reserve', {
    p_user: userId,
    p_resource: resource,
    p_reference: reference,
  });
  if (error) {
    if (error.message.includes('CREDIT_EXHAUSTED')) throw new CreditExhaustedError(resource);
    throw error;
  }
}

export async function consumeCredit(userId: string, resource: CreditResource, reference: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc('credit_consume', {
    p_user: userId,
    p_resource: resource,
    p_reference: reference,
    p_key: `consume:${resource}:${reference}`,
  });
  if (error) throw error;
}

export async function releaseCredit(userId: string, resource: CreditResource, reference: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc('credit_release', {
    p_user: userId,
    p_resource: resource,
    p_reference: reference,
    p_key: `release:${resource}:${reference}`,
  });
  if (error) throw error;
}

export async function creditAvailable(userId: string, resource: CreditResource): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('credit_available', {
    p_user: userId,
    p_resource: resource,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

/** Daily pipeline step: open the due periods and issue their grants. */
export async function ensurePeriodGrants(): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('credit_ensure_period_grants');
  if (error) throw error;
  return Number(data ?? 0);
}
