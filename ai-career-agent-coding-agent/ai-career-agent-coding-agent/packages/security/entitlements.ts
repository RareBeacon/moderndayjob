import { supabaseAdmin } from '../../lib/supabase';
import { normalizePlanCode, type PlanCode } from '../shared/plans';

export interface WorkspaceEntitlement {
  user_id: string;
  account_status: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED' | string;
  plan: PlanCode;
  subscription_status: string | null;
  trial_ends_at: string | null;
  automation_enabled: boolean;
  ai_credits_remaining: number;
  applications_remaining: number;
  tool_uses_remaining: number | null;
  subscription_expires_at?: string | null;
  subscription_source?: string | null;
  applications_used_this_period?: number;
  applications_monthly_limit?: number | null;
  applications_unlimited?: boolean;
  billing_period_start?: string | null;
}

export async function getEntitlement(userId: string): Promise<WorkspaceEntitlement> {
  const { data, error } = await supabaseAdmin
    .from('v_workspace_entitlements')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  const raw = (data ?? {}) as Record<string, unknown>;
  const normalizedPlan = normalizePlanCode(raw.plan);
  const unlimited =
    typeof raw.applications_unlimited === 'boolean'
      ? raw.applications_unlimited
      : normalizedPlan === 'ULTRA';
  const monthlyLimit =
    raw.applications_monthly_limit !== undefined
      ? (raw.applications_monthly_limit as number | null)
      : normalizedPlan === 'ULTRA'
        ? null
        : normalizedPlan === 'PREMIUM'
          ? 50
          : normalizedPlan === 'BASIC'
            ? 30
            : 0;
  return {
    ...(raw as unknown as WorkspaceEntitlement),
    plan: normalizedPlan,
    applications_unlimited: unlimited,
    applications_monthly_limit: monthlyLimit,
  };
}

export async function assertEntitlement(userId: string, feature: string): Promise<WorkspaceEntitlement> {
  const e = await getEntitlement(userId);
  if (e.account_status !== 'ACTIVE') throw new Error('ACCOUNT_BLOCKED');
  if (feature === 'automation' && !e.automation_enabled) throw new Error('AUTOMATION_NOT_ENTITLED');
  return e;
}
