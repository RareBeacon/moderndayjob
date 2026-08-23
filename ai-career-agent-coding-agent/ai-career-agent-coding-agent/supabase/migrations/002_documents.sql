-- Private career documents. Files are not publicly readable; access is user-scoped.
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('MASTER_CV','TAILORED_CV','COVER_LETTER','PORTFOLIO')),
  original_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  byte_size integer not null check (byte_size > 0 and byte_size <= 5242880),
  sha256 text not null,
  created_at timestamptz not null default now()
);
create index if not exists documents_user_created_idx on public.documents(user_id,created_at desc);
alter table public.documents enable row level security;
create policy "documents owner read" on public.documents for select using (auth.uid()=user_id);
create policy "documents owner delete" on public.documents for delete using (auth.uid()=user_id);
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('career-documents','career-documents',false,5242880,array['application/pdf'])
on conflict (id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['application/pdf'];
create policy "private career document object select" on storage.objects for select using (bucket_id='career-documents' and auth.uid()::text=(storage.foldername(name))[1]);
create policy "private career document object delete" on storage.objects for delete using (bucket_id='career-documents' and auth.uid()::text=(storage.foldername(name))[1]);
