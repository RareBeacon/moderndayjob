-- 039: application deduplication hard guarantee (Milestone 4).
--
-- The service layer already refuses duplicate active applications per
-- (user, job) with a DUPLICATE gate; this partial unique index makes the
-- guarantee airtight under concurrency (two racing prepare calls, or a
-- discovery task and a manual prepare at the same moment).
--
-- Active/post-submission statuses participate: once an application is
-- submitted (or in interview, or parked for verification), no second active
-- application to the same job can exist. Withdrawn / rejected / cancelled /
-- failed applications free the slot again, so a user can re-apply later.
--
-- Defensive cleanup first (no-op today: the table is empty and the service
-- gate has been in place): keep the NEWEST active application per
-- (user_id, job_id), cancel older duplicates with a disclosed reason.

with ranked as (
  select id, row_number() over (partition by user_id, job_id order by created_at desc, id desc) as rn
  from public.applications
  where status in ('DRAFT', 'PREPARING', 'AWAITING_APPROVAL', 'APPROVED', 'QUEUED',
                   'AWAITING_VERIFICATION', 'AWAITING_USER_INPUT')
)
update public.applications a
   set status = 'CANCELLED',
       error = 'Duplicate application (auto-deduplicated)'
  from ranked r
 where a.id = r.id
   and r.rn > 1;

create unique index if not exists applications_user_job_active_uidx
  on public.applications (user_id, job_id)
  where status in ('DRAFT', 'PREPARING', 'AWAITING_APPROVAL', 'APPROVED', 'QUEUED',
                   'SUBMITTED', 'INTERVIEW', 'AWAITING_VERIFICATION', 'AWAITING_USER_INPUT');
