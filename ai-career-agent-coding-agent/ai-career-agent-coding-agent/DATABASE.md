# Jobiest - Database Schema, RLS & Storage Authority

Source of truth: `supabase/migrations/001_initial.sql` through `046_fix_period_grants.sql`  
Automated source-level enforcement: `tests/security-baseline.test.ts` (`D1`, `D2`, `D6`)

---

## 1. Critical Schema Rules (Preventing Column Drift)

1. **`public.profiles` primary key is `user_id` (`uuid references auth.users(id) on delete cascade`)**, NOT `id`.
2. **`public.profiles` name column is `full_name`**, NOT `display_name`.
3. **Target roles live on `public.profiles.target_roles` (`text[]`)**, NOT a separate `target_roles` table.
4. **Career details (`headline`, `summary`, `skills text[]`, `experience jsonb`, `education jsonb`, `projects jsonb`, `links jsonb`, `not_applicable_sections text[]`) live on `public.career_profiles` (`PK: user_id`)**.
5. **Every `public` table (`58/58`) has `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`**, and **zero** policies use `USING (true)` or `WITH CHECK (true)`.
6. **Every `SECURITY DEFINER` function pins `SET search_path = public` (or `'public'`)**.

---

## 2. User -> Profile -> Entitlement Lifecycle

1. **Database trigger (`on_auth_user_created` -> `public.handle_new_user()`, updated in `032_signup_contact.sql`)**:
   - Inserts `public.workspaces` (`name = coalesce(full_name, 'My Workspace')`).
   - Inserts `public.profiles` (`user_id`, `workspace_id`, `full_name`, `email`, `phone`).
   - Inserts `public.workspace_members` (`role = 'OWNER'`).
   - Inserts `public.subscriptions` (`plan = 'FREE'`, `status = 'TRIAL'`, 7-day window).
2. **Idempotent application backfill (`ensureProfile(user)` in `lib/auth/profile.ts`)**:
   - Checks `profiles` by `user_id`; if absent (race or legacy import), creates workspace and upserts `profiles`, `workspace_members`, and `subscriptions` with `onConflict` + `ignoreDuplicates: true` so existing user data is never overwritten.
3. **Automatic credit-grant triggers (`046_fix_period_grants.sql`)**:
   - Triggers on `profiles`, `subscriptions`, `scheduled_plan_changes`, and `auto_apply_activations` invoke `tg_ensure_user_period_grants()` -> `credit_ensure_user_period_grants(p_user)` so monthly `DOCUMENT` and `AUTO_APPLY` credits exist immediately at signup, OAuth callback, and plan upgrade.

---

## 3. Core Tables & RLS Policy Model (58 Tables)

| Domain | Tables | Access Model |
|---|---|---|
| **Identity & Workspace** | `workspaces`, `profiles`, `workspace_members`, `career_profiles`, `job_preferences`, `app_sessions` | Self-read/write RLS (`auth.uid() = user_id`) on `profiles`, `career_profiles`, `job_preferences`; member read on `workspaces`; `app_sessions` is service-role-only (RLS enabled, zero client policies). |
| **Documents & Studio** | `documents`, `generated_documents`, `resume_studio_drafts`, `portfolios` | Self-scoped RLS on `generated_documents` and `resume_studio_drafts`; all API reads/writes additionally filter `.eq('user_id', user.id)`. |
| **Jobs & Applications** | `jobs`, `job_sources`, `saved_jobs`, `applications`, `agent_tasks`, `scheduled_runs` | Self-scoped RLS on `applications` and `agent_tasks`; `jobs`, `job_sources`, `saved_jobs`, and `scheduled_runs` are accessed strictly via authenticated server routes filtering `user_id` where tenant-owned. |
| **Billing & Entitlements** | `subscription_plans`, `subscriptions`, `subscription_history`, `scheduled_plan_changes`, `payments`, `payment_events`, `payment_quotes`, `coupons`, `coupon_redemptions`, `usage_daily`, `usage_lifetime`, `credit_periods`, `credit_ledger`, `credit_holds`, `auto_apply_activations` | Read-only self policies on `subscriptions`, `payments`, `usage_daily`; mutations occur exclusively through server-side `SECURITY DEFINER` RPCs (`apply_verified_payment`, `apply_quoted_payment`, `credit_reserve`, `credit_consume`, `credit_release`, `admin_change_subscription`). |
| **AI, Free Tools & Notifications** | `ai_credentials`, `ai_usage`, `free_tool_events`, `free_tool_results`, `notifications` | Self policies on `ai_credentials` (ciphertext only; decrypted server-side via `ENCRYPTION_MASTER_KEY`), `free_tool_results`, and `notifications`. |
| **Admin, Audit, Support & SEO** | `admin_users`, `admin_actions`, `audit_logs`, `security_events`, `account_relationships`, `email_verification_codes`, `app_config`, `support_*` (6 tables), `seo_*` (9 tables) | Service-role-only (RLS enabled, zero anon/authenticated policies). Admin routes enforce `requireAdminUser` + `requireAuditEvent`. |

---

## 4. Storage Buckets & File Security

- **`career-documents` (`002_documents.sql`)**:
  - `public = false`, `file_size_limit = 5242880` (5 MB), `allowed_mime_types = array['application/pdf']`.
  - Storage RLS policies restrict `SELECT` and `DELETE` on `storage.objects` to `bucket_id = 'career-documents' AND auth.uid()::text = (storage.foldername(name))[1]`.
  - Upload route (`POST /api/documents`) enforces `%PDF-` magic-byte verification, SHA-256 hashing, UUID path prefixing (`${user.id}/${uuid}-${safeName}`), and atomic rollback if the DB row insert fails.
  - Download route (`GET /api/documents/[id]/download`) verifies `.eq('id', id).eq('user_id', user.id)` before issuing a 60-second signed URL.
- **Resume photos (`POST /api/resume-studio/photo`)**:
  - Validated server-side via magic bytes (JPEG/PNG only, `<= 2 MB`), stored as validated data URLs inside `resume_studio_drafts`, and re-validated prior to PDF/DOCX embedding (`lib/documents/export.ts`).
