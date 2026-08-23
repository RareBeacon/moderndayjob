create extension if not exists pgcrypto;

create type public.account_status as enum ('ACTIVE','SUSPENDED','TERMINATED');
create type public.plan_code as enum ('FREE','BASIC','PREMIUM');
create type public.subscription_status as enum ('TRIAL','ACTIVE_BASIC','ACTIVE_PREMIUM','PAST_DUE','CANCELLED','EXPIRED','SUSPENDED');

create table public.workspaces(id uuid primary key default gen_random_uuid(),name text not null,created_at timestamptz not null default now());
create table public.profiles(user_id uuid primary key references auth.users(id) on delete cascade,workspace_id uuid not null references public.workspaces(id),full_name text,email text,target_roles text[] default '{}',account_status account_status not null default 'ACTIVE',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.workspace_members(workspace_id uuid references public.workspaces(id) on delete cascade,user_id uuid references auth.users(id) on delete cascade,role text not null default 'MEMBER',primary key(workspace_id,user_id));
create table public.career_profiles(id uuid primary key default gen_random_uuid(),user_id uuid unique references auth.users(id) on delete cascade,headline text,summary text,experience jsonb not null default '[]',skills text[] default '{}',education jsonb not null default '[]',projects jsonb not null default '[]',links jsonb not null default '{}',created_at timestamptz default now(),updated_at timestamptz default now());
create table public.subscription_plans(code plan_code primary key,amount numeric(12,2) not null,currency text not null default 'NGN',daily_ai_credits int not null,daily_applications int not null,flutterwave_plan_id text);
insert into public.subscription_plans values ('FREE',0,'NGN',2,0,null),('BASIC',5000,'NGN',4,10,null),('PREMIUM',10000,'NGN',8,20,null) on conflict do nothing;
create table public.subscriptions(id uuid primary key default gen_random_uuid(),user_id uuid unique references auth.users(id) on delete cascade,plan plan_code not null default 'FREE',status subscription_status not null default 'TRIAL',trial_started_at timestamptz,trial_ends_at timestamptz,current_period_start timestamptz,current_period_end timestamptz,provider text,provider_customer_id text,provider_subscription_id text,cancelled_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
create table public.payments(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),provider text not null,transaction_id text unique,tx_ref text unique,amount numeric(12,2),currency text,status text,payment_type text,raw_event_id text,created_at timestamptz default now());
create table public.payment_events(id uuid primary key default gen_random_uuid(),event_id text unique not null,event_type text,event_payload jsonb,processed_at timestamptz default now());
create table public.ai_credentials(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete cascade,provider text not null,model text,base_url text not null,ciphertext text not null,status text not null default 'ACTIVE',key_version int not null default 1,created_at timestamptz default now(),rotated_at timestamptz);
create table public.usage_daily(user_id uuid references auth.users(id) on delete cascade,day date not null,ai_used int not null default 0,applications_used int not null default 0,primary key(user_id,day));
create table public.jobs(id uuid primary key default gen_random_uuid(),source text,external_id text,company text,title text,url text,description text,location text,metadata jsonb default '{}',created_at timestamptz default now(),unique(source,external_id));
create table public.applications(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete cascade,job_id uuid references public.jobs(id),email text not null,status text not null default 'QUEUED',idempotency_key text unique,submitted_at timestamptz,error text,created_at timestamptz default now());
create table public.agent_tasks(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete cascade,application_id uuid references public.applications(id),type text not null,status text not null default 'QUEUED',attempts int default 0,payload jsonb default '{}',result jsonb,created_at timestamptz default now(),updated_at timestamptz default now());
create table public.security_events(id uuid primary key default gen_random_uuid(),user_id uuid,event_type text not null,severity text not null,ip_hash text,user_agent text,metadata jsonb default '{}',created_at timestamptz default now());
create table public.account_relationships(id uuid primary key default gen_random_uuid(),user_a uuid references auth.users(id) on delete cascade,user_b uuid references auth.users(id) on delete cascade,risk_score int not null default 0,signals jsonb default '{}',status text default 'REVIEW',created_at timestamptz default now(),unique(user_a,user_b));
create table public.admin_users(user_id uuid primary key references auth.users(id) on delete cascade);
create table public.admin_actions(id uuid primary key default gen_random_uuid(),admin_user_id uuid references auth.users(id),target_user_id uuid references auth.users(id),action text not null,metadata jsonb default '{}',created_at timestamptz default now());

create or replace view public.v_workspace_entitlements as
select p.user_id,p.account_status,coalesce(s.plan,'FREE') as plan,s.status as subscription_status,s.trial_ends_at,
case when p.account_status='ACTIVE' and (s.plan='BASIC' or s.plan='PREMIUM' or (s.status='TRIAL' and s.trial_ends_at>now())) then true else false end as automation_enabled,
greatest(0,(case when s.plan='PREMIUM' then 8 when s.plan='BASIC' then 4 else 2 end)-coalesce(u.ai_used,0)) as ai_credits_remaining,
greatest(0,(case when s.plan='PREMIUM' then 20 when s.plan='BASIC' then 10 else 0 end)-coalesce(u.applications_used,0)) as applications_remaining
from public.profiles p left join public.subscriptions s on s.user_id=p.user_id left join public.usage_daily u on u.user_id=p.user_id and u.day=current_date;

create or replace function public.consume_ai_credit(p_user_id uuid) returns void language plpgsql security definer as $$
declare lim int; used int; plan public.plan_code;
begin select coalesce(s.plan,'FREE') into plan from subscriptions s where s.user_id=p_user_id; lim:=case when plan='PREMIUM' then 8 when plan='BASIC' then 4 else 2 end; insert into usage_daily(user_id,day) values(p_user_id,current_date) on conflict do nothing; select ai_used into used from usage_daily where user_id=p_user_id and day=current_date for update; if used>=lim then raise exception 'AI_QUOTA_EXHAUSTED'; end if; update usage_daily set ai_used=ai_used+1 where user_id=p_user_id and day=current_date; end $$;

create or replace function public.reserve_application_slot(p_user_id uuid,p_job_id uuid,p_email text) returns uuid language plpgsql security definer as $$
declare lim int; used int; plan public.plan_code; app_id uuid; idem text;
begin select coalesce(s.plan,'FREE') into plan from subscriptions s where s.user_id=p_user_id; if plan='FREE' then raise exception 'AUTOMATION_NOT_ENTITLED'; end if; lim:=case when plan='PREMIUM' then 20 else 10 end; insert into usage_daily(user_id,day) values(p_user_id,current_date) on conflict do nothing; select applications_used into used from usage_daily where user_id=p_user_id and day=current_date for update; if used>=lim then raise exception 'APPLICATION_QUOTA_EXHAUSTED'; end if; idem:=p_user_id::text||':'||p_job_id::text; select id into app_id from applications where idempotency_key=idem; if app_id is not null then return app_id; end if; insert into applications(user_id,job_id,email,idempotency_key) values(p_user_id,p_job_id,p_email,idem) returning id into app_id; update usage_daily set applications_used=applications_used+1 where user_id=p_user_id and day=current_date; insert into agent_tasks(user_id,application_id,type,payload) values(p_user_id,app_id,'APPLICATION',jsonb_build_object('job_id',p_job_id)); return app_id; end $$;

create or replace function public.apply_verified_payment(p_transaction_id text,p_tx_ref text,p_amount numeric,p_currency text,p_email text) returns void language plpgsql security definer as $$
declare uid uuid; plan public.plan_code;
begin select id into uid from auth.users where lower(email)=lower(p_email); if uid is null then raise exception 'USER_NOT_FOUND'; end if; select case when p_amount>=10000 then 'PREMIUM'::plan_code else 'BASIC'::plan_code end into plan; insert into payments(user_id,provider,transaction_id,tx_ref,amount,currency,status) values(uid,'flutterwave',p_transaction_id,p_tx_ref,p_amount,p_currency,'successful') on conflict(transaction_id) do nothing; insert into subscriptions(user_id,plan,status,current_period_start,current_period_end,provider,provider_customer_id) values(uid,plan,case when plan='PREMIUM' then 'ACTIVE_PREMIUM' else 'ACTIVE_BASIC' end,now(),now()+interval '30 days','flutterwave',p_email) on conflict(user_id) do update set plan=excluded.plan,status=excluded.status,current_period_start=now(),current_period_end=now()+interval '30 days',updated_at=now(); end $$;

alter table public.profiles enable row level security; alter table public.workspace_members enable row level security; alter table public.career_profiles enable row level security; alter table public.jobs enable row level security; alter table public.applications enable row level security; alter table public.agent_tasks enable row level security; alter table public.usage_daily enable row level security;
create policy profile_self on profiles for select using(auth.uid()=user_id);
create policy career_self on career_profiles for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy applications_self on applications for select using(auth.uid()=user_id);
create policy tasks_self on agent_tasks for select using(auth.uid()=user_id);
create policy usage_self on usage_daily for select using(auth.uid()=user_id);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer as $$ declare wid uuid; begin insert into workspaces(name) values(coalesce(new.raw_user_meta_data->>'full_name','My Workspace')) returning id into wid; insert into profiles(user_id,workspace_id,full_name,email) values(new.id,wid,new.raw_user_meta_data->>'full_name',new.email); insert into workspace_members(workspace_id,user_id,role) values(wid,new.id,'OWNER'); insert into subscriptions(user_id,plan,status,trial_started_at,trial_ends_at) values(new.id,'FREE','TRIAL',now(),now()+interval '7 days'); return new; end $$;
drop trigger if exists on_auth_user_created on auth.users; create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace view public.admin_user_overview as
select p.user_id,p.email,p.full_name,p.account_status,coalesce(s.plan,'FREE') plan,coalesce(ar.risk_score,0) risk_score,p.created_at
from public.profiles p left join public.subscriptions s on s.user_id=p.user_id left join lateral (select max(risk_score) risk_score from public.account_relationships where user_a=p.user_id or user_b=p.user_id) ar on true;
