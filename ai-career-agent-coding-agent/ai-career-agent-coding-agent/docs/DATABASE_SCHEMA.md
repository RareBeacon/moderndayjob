# AI Career Agent, Database Schema

## Design Rules

- PostgreSQL.
- UUID primary keys.
- `created_at`, `updated_at` on mutable entities.
- `user_id` on user-owned records.
- RLS enabled on exposed tables.
- Foreign keys with deliberate delete behavior.
- Unique constraints for idempotency.
- JSONB only where flexible provider/source payloads are justified.

## Core Tables

### profiles

```sql
id uuid primary key references auth.users(id) on delete cascade
display_name text
headline text
bio text
phone text
location text
country text
timezone text
avatar_url text
created_at timestamptz
updated_at timestamptz
```

### target_roles

```sql
id uuid primary key
user_id uuid references profiles(id) on delete cascade
role_name text not null
is_primary boolean default false
priority integer default 0
created_at timestamptz
```

### skills

```sql
id uuid primary key
user_id uuid references profiles(id) on delete cascade
name text not null
proficiency text
years_experience numeric
source text
verified boolean default false
```

### experiences

```sql
id uuid primary key
user_id uuid references profiles(id) on delete cascade
company text
title text
employment_type text
start_date date
end_date date
is_current boolean
description text
achievements jsonb
verified boolean default false
```

### projects

```sql
id uuid primary key
user_id uuid references profiles(id) on delete cascade
name text
description text
url text
technologies jsonb
achievements jsonb
verified boolean default false
```

### education

```sql
id uuid primary key
user_id uuid references profiles(id) on delete cascade
institution text
degree text
field text
start_date date
end_date date
verified boolean default false
```

### certifications

```sql
id uuid primary key
user_id uuid references profiles(id) on delete cascade
name text
issuer text
issue_date date
expiry_date date
credential_url text
verified boolean default false
```

### job_preferences

```sql
id uuid primary key
user_id uuid unique references profiles(id) on delete cascade
remote_types jsonb
locations jsonb
countries jsonb
employment_types jsonb
seniority_levels jsonb
minimum_salary numeric
currency text
industries jsonb
include_keywords jsonb
exclude_keywords jsonb
minimum_match_score integer default 80
daily_application_target integer default 10
application_mode text default 'approval'
active boolean default true
```

### resumes

```sql
id uuid primary key
user_id uuid references profiles(id) on delete cascade
name text
storage_path text
resume_type text
version integer
source_resume_id uuid
job_id uuid null
content_hash text
is_master boolean default false
created_at timestamptz
```

### job_sources

```sql
id uuid primary key
name text
source_type text
base_url text
enabled boolean default true
config jsonb
created_at timestamptz
```

### jobs

```sql
id uuid primary key
source_id uuid references job_sources(id)
source_job_id text
company_name text
company_domain text
title text
description text
location text
remote_type text
employment_type text
seniority text
salary_min numeric
salary_max numeric
salary_currency text
application_url text
canonical_url text
posted_at timestamptz
expires_at timestamptz
content_hash text
raw_data jsonb
created_at timestamptz
updated_at timestamptz
unique(source_id, source_job_id)
```

### job_matches

```sql
id uuid primary key
user_id uuid references profiles(id) on delete cascade
job_id uuid references jobs(id) on delete cascade
score integer
skill_score integer
experience_score integer
role_score integer
location_score integer
salary_score integer
reasoning jsonb
decision text
created_at timestamptz
unique(user_id, job_id)
```

### applications

```sql
id uuid primary key
user_id uuid references profiles(id) on delete cascade
job_id uuid references jobs(id)
status text
match_score integer
application_mode text
submitted_at timestamptz
confirmation_url text
external_application_id text
failure_reason text
idempotency_key text unique
created_at timestamptz
updated_at timestamptz
```

### application_documents

```sql
id uuid primary key
application_id uuid references applications(id) on delete cascade
document_type text
resume_id uuid references resumes(id)
storage_path text
content_hash text
created_at timestamptz
```

### application_answers

```sql
id uuid primary key
application_id uuid references applications(id) on delete cascade
question text
answer text
source_facts jsonb
verified boolean default false
created_at timestamptz
```

### agent_runs

```sql
id uuid primary key
user_id uuid references profiles(id) on delete cascade
run_type text
status text
started_at timestamptz
finished_at timestamptz
items_found integer
items_shortlisted integer
applications_submitted integer
error_count integer
metadata jsonb
```

### agent_events

```sql
id uuid primary key
agent_run_id uuid references agent_runs(id) on delete cascade
user_id uuid references profiles(id) on delete cascade
event_type text
message text
metadata jsonb
created_at timestamptz
```

### email_accounts

```sql
id uuid primary key
user_id uuid references profiles(id) on delete cascade
provider text
email_address text
encrypted_access_token text
encrypted_refresh_token text
token_expires_at timestamptz
scopes jsonb
status text
created_at timestamptz
updated_at timestamptz
```

### email_events

```sql
id uuid primary key
user_id uuid references profiles(id) on delete cascade
email_account_id uuid references email_accounts(id) on delete cascade
provider_message_id text
thread_id text
sender text
subject text
received_at timestamptz
classification text
confidence numeric
application_id uuid null references applications(id)
metadata jsonb
created_at timestamptz
unique(email_account_id, provider_message_id)
```

### interviews

```sql
id uuid primary key
user_id uuid references profiles(id) on delete cascade
application_id uuid references applications(id)
email_event_id uuid references email_events(id)
scheduled_at timestamptz
timezone text
meeting_url text
status text
confidence numeric
created_at timestamptz
updated_at timestamptz
```

### notifications

```sql
id uuid primary key
user_id uuid references profiles(id) on delete cascade
type text
title text
body text
read_at timestamptz
metadata jsonb
created_at timestamptz
```

### audit_logs

```sql
id uuid primary key
user_id uuid references profiles(id) on delete cascade
actor_type text
action text
resource_type text
resource_id uuid
metadata jsonb
created_at timestamptz
```

## RLS

Every user-owned table must enforce:

```sql
auth.uid() = user_id
```

or an equivalent ownership path.

Administrative/service operations must run server-side using a restricted service role.

## Indexes

Create indexes for:
- `user_id`
- application status
- job title
- company
- posted_at
- job content hash
- application idempotency key
- email provider message ID
- agent run status
- notification unread state

## Security and billing additions
See `supabase/migrations/001_initial.sql` for the executable schema covering subscriptions, payments, payment events, encrypted AI credentials, usage counters, applications, agent tasks, security events, account relationships, admin actions, RLS, entitlements and atomic quota functions.
