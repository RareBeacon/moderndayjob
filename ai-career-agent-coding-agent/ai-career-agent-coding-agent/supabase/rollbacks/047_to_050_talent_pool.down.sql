-- Reversible rollback for migrations 047..050 (Jobiest Talent Pool & Employer Platform)
-- Stored in supabase/rollbacks/ so forward migration runner ignores it unless invoked explicitly.

drop policy if exists "talent_recordings_owner_read" on storage.objects;
drop policy if exists "talent_recordings_owner_insert" on storage.objects;

-- 051_talent_rag_and_langgraph_checkpoints.sql
drop function if exists public.match_talent_rag_chunks(vector, text, uuid, text, text, text, integer) cascade;
drop table if exists public.talent_workflow_checkpoints cascade;
drop table if exists public.talent_interview_blueprints cascade;
drop table if exists public.talent_assessment_contexts cascade;
drop table if exists public.talent_rag_chunks cascade;
drop table if exists public.talent_rag_documents cascade;

-- 050_talent_interactions_and_messaging.sql
drop table if exists public.talent_interaction_reports cascade;
drop table if exists public.talent_messages cascade;
drop table if exists public.talent_conversations cascade;
drop table if exists public.talent_contact_requests cascade;

-- 049_employer_and_recruiter_platform.sql
drop table if exists public.talent_placements cascade;
drop table if exists public.recruitment_pipeline_entries cascade;
drop table if exists public.employer_shortlist_candidates cascade;
drop table if exists public.employer_shortlists cascade;
drop table if exists public.recruitment_vacancies cascade;
drop table if exists public.employer_saved_candidates cascade;
drop table if exists public.employer_verifications cascade;
drop table if exists public.employer_members cascade;
drop table if exists public.employer_organizations cascade;

-- 048_talent_interviews_and_assessments.sql
drop table if exists public.talent_admin_reviews cascade;
drop table if exists public.talent_assessment_dimensions cascade;
drop table if exists public.talent_assessment_reports cascade;
drop table if exists public.talent_interview_transcripts cascade;
drop table if exists public.talent_interview_answers cascade;
drop table if exists public.talent_interview_recordings cascade;
drop table if exists public.talent_interview_questions cascade;
drop table if exists public.talent_interview_sessions cascade;

-- 047_talent_pool_applications.sql
drop table if exists public.talent_consents cascade;
drop table if exists public.talent_application_snapshots cascade;
drop table if exists public.talent_applications cascade;
drop table if exists public.talent_pool_profiles cascade;

drop function if exists public.is_verified_employer_member(uuid) cascade;
drop function if exists public.is_employer_org_member(uuid) cascade;

delete from storage.buckets where id = 'talent-recordings';
