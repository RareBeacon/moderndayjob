-- =============================================================================
-- Migration 058: Add ULTRA plan_code and ACTIVE_ULTRA subscription_status
-- =============================================================================
-- Kept in its own migration unit so PostgreSQL commits the new enum labels
-- before subsequent DDL/DML migrations reference 'ULTRA'::public.plan_code
-- and 'ACTIVE_ULTRA'::public.subscription_status (avoids SQLSTATE 55P04).
-- Idempotent and non-destructive: existing 'MAX' / 'ACTIVE_MAX' enum labels
-- remain in pg_enum so historical subscription_history rows stay valid.
-- =============================================================================

alter type public.plan_code add value if not exists 'ULTRA';
alter type public.subscription_status add value if not exists 'ACTIVE_ULTRA';
