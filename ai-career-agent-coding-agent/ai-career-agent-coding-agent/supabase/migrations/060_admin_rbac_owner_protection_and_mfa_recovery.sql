-- =============================================================================
-- Migration 060: Admin RBAC Hierarchy, Owner Protection, Immutable Admin Audit
--                Logs & Hashed MFA Recovery Codes
-- =============================================================================
-- Security & Governance Invariants:
--   1. 3-tier Admin RBAC: OWNER -> SUB_ADMIN (configurable permissions) -> STAFF.
--   2. The existing primary administrator row in public.admin_users is promoted
--      to OWNER (is_owner = true). Partial unique index + BEFORE trigger make it
--      impossible to create a second OWNER, delete the OWNER, deactivate the
--      OWNER, or alter the OWNER's role/user_id.
--   3. public.admin_audit_logs is strictly append-only (BEFORE UPDATE OR DELETE
--      raises AUDIT_LOG_IMMUTABLE). RLS enabled with zero anon/authenticated
--      policies.
--   4. public.admin_change_subscription enforces active admin + granular
--      can_manage_subscriptions permission, requires a non-empty reason (>= 5
--      chars), supports ULTRA (and normalizes legacy MAX -> ULTRA), never
--      creates payment records, and appends an immutable admin_audit_logs row.
--   5. public.mfa_recovery_codes stores ONLY salted cryptographic hashes of
--      single-use backup codes (never plaintext), RLS enabled with zero client
--      policies; public.app_sessions gains mfa_recovery_verified_at so a
--      verified recovery code safely elevates only that bound server session.
-- =============================================================================

-- 1. Admin RBAC & Owner Protection --------------------------------------------
alter table public.admin_users
  add column if not exists role text not null default 'SUB_ADMIN'
    check (role in ('OWNER', 'SUB_ADMIN', 'STAFF')),
  add column if not exists is_owner boolean not null default false,
  add column if not exists permissions jsonb not null default '{}'::jsonb,
  add column if not exists is_active boolean not null default true,
  add column if not exists require_mfa boolean not null default true,
  add column if not exists assigned_by uuid references auth.users(id) on delete set null,
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Promote the existing sole admin row (when no owner exists yet) to OWNER.
do $$
declare
  v_owner_exists boolean;
  v_first_admin uuid;
begin
  select exists(select 1 from public.admin_users where is_owner = true or role = 'OWNER')
    into v_owner_exists;

  if not v_owner_exists then
    select user_id into v_first_admin
      from public.admin_users
     order by created_at asc
     limit 1;

    if v_first_admin is not null then
      update public.admin_users
         set role = 'OWNER',
             is_owner = true,
             is_active = true,
             require_mfa = true,
             permissions = jsonb_build_object(
               'can_view_analytics', true,
               'can_view_users', true,
               'can_reveal_pii', true,
               'can_manage_subscriptions', true,
               'can_suspend_users', true,
               'can_terminate_users', true,
               'can_manage_coupons', true,
               'can_manage_support', true,
               'can_manage_seo', true,
               'can_manage_talent_pool', true,
               'can_manage_employers', true,
               'can_manage_radar', true,
               'can_manage_credentials', true,
               'can_view_security', true,
               'can_view_audit_logs', true,
               'can_manage_admins', true
             ),
             updated_at = now()
       where user_id = v_first_admin;
    end if;
  end if;
end $$;

create unique index if not exists idx_admin_users_single_owner
  on public.admin_users ((true))
  where is_owner = true or role = 'OWNER';

create or replace function public.protect_owner_admin_row()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.is_owner = true or old.role = 'OWNER' then
      raise exception 'OWNER_PROTECTED: The platform Owner account cannot be removed from admin_users.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.role = 'OWNER' or new.is_owner = true then
      if exists (select 1 from public.admin_users where is_owner = true or role = 'OWNER') then
        raise exception 'OWNER_ALREADY_EXISTS: Only one Owner account may exist.';
      end if;
      new.role := 'OWNER';
      new.is_owner := true;
      new.is_active := true;
      new.require_mfa := true;
    else
      new.is_owner := false;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.is_owner = true or old.role = 'OWNER' then
      if new.user_id <> old.user_id
         or new.role <> 'OWNER'
         or new.is_owner <> true
         or new.is_active <> true then
        raise exception 'OWNER_IMMUTABLE: The Owner account cannot be demoted, reassigned, or deactivated.';
      end if;
      new.require_mfa := true;
    elsif new.role = 'OWNER' or new.is_owner = true then
      raise exception 'OWNER_PROMOTION_FORBIDDEN: Sub-admins and staff cannot be promoted to Owner.';
    end if;
    new.updated_at := now();
    return new;
  end if;

  return new;
end $$;

drop trigger if exists trg_protect_owner_admin on public.admin_users;
create trigger trg_protect_owner_admin
  before insert or update or delete on public.admin_users
  for each row execute function public.protect_owner_admin_row();

alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;

-- 2. Append-Only Immutable Admin Audit Trail ----------------------------------
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text not null,
  action text not null,
  target_type text not null,
  target_id text,
  before_state jsonb,
  after_state jsonb,
  reason text,
  ip_hash text,
  user_agent text,
  mfa_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_audit_logs_created_at
  on public.admin_audit_logs (created_at desc);
create index if not exists idx_admin_audit_logs_actor
  on public.admin_audit_logs (actor_user_id, created_at desc);
create index if not exists idx_admin_audit_logs_target
  on public.admin_audit_logs (target_type, target_id, created_at desc);

create or replace function public.prevent_admin_audit_mutation()
returns trigger
language plpgsql as $$
begin
  raise exception 'AUDIT_LOG_IMMUTABLE: Administrative audit logs cannot be modified or deleted.';
end $$;

drop trigger if exists trg_admin_audit_logs_immutable on public.admin_audit_logs;
create trigger trg_admin_audit_logs_immutable
  before update or delete on public.admin_audit_logs
  for each row execute function public.prevent_admin_audit_mutation();

drop trigger if exists trg_admin_actions_immutable on public.admin_actions;
create trigger trg_admin_actions_immutable
  before update or delete on public.admin_actions
  for each row execute function public.prevent_admin_audit_mutation();

alter table public.admin_audit_logs enable row level security;
revoke all on public.admin_audit_logs from anon, authenticated;

-- Helper: check whether an admin has a specific permission in SQL.
create or replace function public.admin_has_permission(
  p_admin_id uuid,
  p_permission text
)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_row public.admin_users%rowtype;
begin
  select * into v_row
    from public.admin_users
   where user_id = p_admin_id
     and is_active = true;
  if not found then
    return false;
  end if;
  if v_row.is_owner = true or v_row.role = 'OWNER' then
    return true;
  end if;
  if v_row.role = 'STAFF' then
    -- STAFF defaults: read-only support/user lookup unless explicitly granted,
    -- NEVER owner-only permissions.
    if p_permission in ('can_manage_admins', 'can_terminate_users', 'can_manage_credentials') then
      return false;
    end if;
  end if;
  if p_permission = 'can_manage_admins' then
    return false;
  end if;
  return coalesce((v_row.permissions ->> p_permission)::boolean, false);
end $$;

-- 3. Hardened admin_change_subscription (RBAC + mandatory reason + ULTRA) -----
create or replace function public.admin_change_subscription(
  p_admin_id uuid,
  p_target_user_id uuid,
  p_new_plan public.plan_code,
  p_duration_days int,
  p_start_mode text,
  p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_admin public.admin_users%rowtype;
  v_target_is_owner boolean := false;
  v_clean_reason text;
  v_target_plan public.plan_code;
  v_sub public.subscriptions%rowtype;
  v_old_plan public.plan_code;
  v_old_status public.subscription_status;
  v_effective public.plan_code;
  v_status public.subscription_status;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_activate_at timestamptz;
  v_result jsonb;
begin
  select * into v_admin
    from public.admin_users
   where user_id = p_admin_id
     and is_active = true;
  if not found then
    raise exception 'FORBIDDEN';
  end if;

  if not public.admin_has_permission(p_admin_id, 'can_manage_subscriptions') then
    raise exception 'FORBIDDEN_INSUFFICIENT_PERMISSION';
  end if;

  -- Non-owners may never alter the Owner account's subscription state.
  select exists(
    select 1 from public.admin_users
     where user_id = p_target_user_id and (is_owner = true or role = 'OWNER')
  ) into v_target_is_owner;
  if v_target_is_owner and not (v_admin.is_owner = true or v_admin.role = 'OWNER') then
    raise exception 'FORBIDDEN_OWNER_TARGET';
  end if;

  v_clean_reason := btrim(coalesce(p_reason, ''));
  if length(v_clean_reason) < 5 then
    raise exception 'REASON_REQUIRED';
  end if;

  v_target_plan := case
    when p_new_plan = 'MAX'::public.plan_code then 'ULTRA'::public.plan_code
    else p_new_plan
  end;

  select * into v_sub from public.subscriptions where user_id = p_target_user_id for update;
  v_old_plan := case
    when v_sub.plan = 'MAX'::public.plan_code then 'ULTRA'::public.plan_code
    else coalesce(v_sub.plan, 'FREE'::public.plan_code)
  end;
  v_old_status := v_sub.status;
  v_effective := public.effective_plan(p_target_user_id);

  if v_target_plan = 'FREE'::public.plan_code then
    update public.scheduled_plan_changes
       set status = 'CANCELLED'
     where user_id = p_target_user_id and status = 'SCHEDULED';

    if v_sub.id is null then
      insert into public.subscriptions(user_id, plan, status, source, granted_by, grant_reason, cancelled_at, current_period_end)
      values (p_target_user_id, 'FREE', 'CANCELLED', 'ADMIN_GRANT', p_admin_id, v_clean_reason, now(), now());
    else
      update public.subscriptions
         set plan = 'FREE',
             status = 'CANCELLED',
             cancelled_at = now(),
             current_period_end = now(),
             source = 'ADMIN_GRANT',
             granted_by = p_admin_id,
             grant_reason = v_clean_reason,
             updated_at = now()
       where user_id = p_target_user_id;
    end if;

    insert into public.subscription_history(user_id, old_plan, new_plan, old_status, new_status, source, actor_id, reason, period_start, period_end)
      values (p_target_user_id, v_old_plan, 'FREE', v_old_status, 'CANCELLED', 'ADMIN_GRANT', p_admin_id, v_clean_reason, v_sub.current_period_start, now());

    v_result := jsonb_build_object(
      'mode', 'applied',
      'oldPlan', v_old_plan,
      'newPlan', 'FREE',
      'status', 'CANCELLED',
      'source', 'ADMIN_GRANT',
      'expiresAt', now()
    );

    insert into public.admin_audit_logs (
      actor_user_id, actor_role, action, target_type, target_id,
      before_state, after_state, reason, mfa_verified
    ) values (
      p_admin_id, v_admin.role, 'ADMIN_SUBSCRIPTION_CHANGE', 'user', p_target_user_id::text,
      jsonb_build_object('plan', v_old_plan, 'status', v_old_status, 'source', v_sub.source, 'period_end', v_sub.current_period_end),
      v_result,
      v_clean_reason,
      true
    );

    return v_result;
  end if;

  if p_duration_days is null or p_duration_days < 1 or p_duration_days > 3650 then
    raise exception 'INVALID_DURATION';
  end if;
  if p_start_mode not in ('IMMEDIATELY', 'AFTER_CURRENT') then
    raise exception 'INVALID_START_MODE';
  end if;

  v_status := case
    when v_target_plan = 'ULTRA'::public.plan_code then 'ACTIVE_ULTRA'
    when v_target_plan = 'PREMIUM'::public.plan_code then 'ACTIVE_PREMIUM'
    else 'ACTIVE_BASIC'
  end::public.subscription_status;

  if p_start_mode = 'AFTER_CURRENT' and v_effective <> 'FREE'::public.plan_code then
    v_activate_at := greatest(coalesce(v_sub.current_period_end, now()), now());
    delete from public.scheduled_plan_changes where user_id = p_target_user_id and status = 'SCHEDULED';
    insert into public.scheduled_plan_changes(user_id, plan, duration_days, granted_by, reason, activate_at)
      values (p_target_user_id, v_target_plan, p_duration_days, p_admin_id, v_clean_reason, v_activate_at);

    insert into public.subscription_history(user_id, old_plan, new_plan, old_status, new_status, source, actor_id, reason, period_start, period_end)
      values (p_target_user_id, v_old_plan, v_target_plan, v_old_status, v_status, 'ADMIN_GRANT_SCHEDULED', p_admin_id, v_clean_reason,
              v_activate_at, v_activate_at + make_interval(days => p_duration_days));

    v_result := jsonb_build_object(
      'mode', 'scheduled',
      'oldPlan', v_old_plan,
      'newPlan', v_target_plan,
      'source', 'ADMIN_GRANT',
      'activateAt', v_activate_at,
      'expiresAt', v_activate_at + make_interval(days => p_duration_days)
    );

    insert into public.admin_audit_logs (
      actor_user_id, actor_role, action, target_type, target_id,
      before_state, after_state, reason, mfa_verified
    ) values (
      p_admin_id, v_admin.role, 'ADMIN_SUBSCRIPTION_SCHEDULED', 'user', p_target_user_id::text,
      jsonb_build_object('plan', v_old_plan, 'status', v_old_status, 'source', v_sub.source, 'period_end', v_sub.current_period_end),
      v_result,
      v_clean_reason,
      true
    );

    return v_result;
  end if;

  if v_old_plan = v_target_plan and v_effective <> 'FREE'::public.plan_code
     and v_sub.current_period_end is not null and v_sub.current_period_end > now() then
    v_period_start := v_sub.current_period_start;
    v_period_end := v_sub.current_period_end + make_interval(days => p_duration_days);
  else
    v_period_start := now();
    v_period_end := now() + make_interval(days => p_duration_days);
  end if;

  insert into public.subscriptions(user_id, plan, status, source, granted_by, grant_reason, current_period_start, current_period_end)
    values (p_target_user_id, v_target_plan, v_status, 'ADMIN_GRANT', p_admin_id, v_clean_reason, v_period_start, v_period_end)
    on conflict (user_id) do update set
      plan = excluded.plan,
      status = excluded.status,
      source = 'ADMIN_GRANT',
      granted_by = excluded.granted_by,
      grant_reason = excluded.grant_reason,
      cancelled_at = null,
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      updated_at = now();

  insert into public.subscription_history(user_id, old_plan, new_plan, old_status, new_status, source, actor_id, reason, period_start, period_end)
    values (p_target_user_id, v_old_plan, v_target_plan, v_old_status, v_status, 'ADMIN_GRANT', p_admin_id, v_clean_reason, v_period_start, v_period_end);

  v_result := jsonb_build_object(
    'mode', 'applied',
    'oldPlan', v_old_plan,
    'newPlan', v_target_plan,
    'status', v_status,
    'source', 'ADMIN_GRANT',
    'periodStart', v_period_start,
    'expiresAt', v_period_end
  );

  insert into public.admin_audit_logs (
    actor_user_id, actor_role, action, target_type, target_id,
    before_state, after_state, reason, mfa_verified
  ) values (
    p_admin_id, v_admin.role, 'ADMIN_SUBSCRIPTION_CHANGE', 'user', p_target_user_id::text,
    jsonb_build_object('plan', v_old_plan, 'status', v_old_status, 'source', v_sub.source, 'period_end', v_sub.current_period_end),
    v_result,
    v_clean_reason,
    true
  );

  return v_result;
end $$;

-- 4. Enriched PII-safe admin_user_overview (preserves B-063 zero-email rule) --
create or replace view public.admin_user_overview as
select
  p.user_id,
  split_part(p.email, '@', 2) as email_domain,
  p.full_name,
  p.account_status,
  public.effective_plan(p.user_id) as plan,
  coalesce(ar.risk_score, 0) as risk_score,
  p.created_at,
  s.status as subscription_status,
  s.source as subscription_source,
  s.current_period_end as subscription_expires_at,
  p.email_verified_at
from public.profiles p
left join public.subscriptions s on s.user_id = p.user_id
left join lateral (
  select max(risk_score) as risk_score
  from public.account_relationships
  where user_a = p.user_id or user_b = p.user_id
) ar on true;

alter view public.admin_user_overview set (security_invoker = on);
revoke select on public.admin_user_overview from anon, authenticated;

-- 5. Hashed Single-Use MFA Recovery Codes & Bound Session Recovery Marker -----
create table if not exists public.mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, code_hash)
);

create index if not exists idx_mfa_recovery_codes_user_unused
  on public.mfa_recovery_codes (user_id)
  where used_at is null;

alter table public.mfa_recovery_codes enable row level security;
revoke all on public.mfa_recovery_codes from anon, authenticated;
comment on table public.mfa_recovery_codes is
  'Salted HMAC-SHA256 hashes of single-use MFA backup recovery codes. Plaintext codes are never persisted. Service-role only.';

alter table public.app_sessions
  add column if not exists mfa_recovery_verified_at timestamptz;
