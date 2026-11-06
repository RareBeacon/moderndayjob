-- Migration 063: Taxonomies, Personal Strengths, and Structured Professional Experiences
-- Jobiest Universal Autocomplete and Experience System Upgrade

-- 1. Personal strengths taxonomy
CREATE TABLE IF NOT EXISTS public.personal_strengths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  normalized_name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  description TEXT,
  aliases TEXT[] DEFAULT '{}'::text[],
  source TEXT DEFAULT 'curated',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. User personal strengths
CREATE TABLE IF NOT EXISTS public.user_personal_strengths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strength_id UUID REFERENCES public.personal_strengths(id) ON DELETE SET NULL,
  custom_strength_name TEXT,
  proficiency_level TEXT,
  display_order INTEGER DEFAULT 0,
  reflection TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Skills taxonomy
CREATE TABLE IF NOT EXISTS public.skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  normalized_name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  subcategory TEXT,
  aliases TEXT[] DEFAULT '{}'::text[],
  description TEXT,
  source TEXT DEFAULT 'curated',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Job roles taxonomy
CREATE TABLE IF NOT EXISTS public.job_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL UNIQUE,
  normalized_title TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  seniority_level TEXT,
  aliases TEXT[] DEFAULT '{}'::text[],
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Locations taxonomy
CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL,
  state_province TEXT,
  country TEXT NOT NULL,
  country_code TEXT NOT NULL,
  display_name TEXT NOT NULL UNIQUE,
  normalized_name TEXT NOT NULL,
  aliases TEXT[] DEFAULT '{}'::text[],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Structured professional experiences
CREATE TABLE IF NOT EXISTS public.professional_experiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  company_website TEXT,
  location TEXT,
  job_title TEXT NOT NULL,
  employment_type TEXT DEFAULT 'full-time',
  workplace_type TEXT DEFAULT 'remote',
  start_month INTEGER CHECK (start_month IS NULL OR (start_month >= 1 AND start_month <= 12)),
  start_year INTEGER CHECK (start_year IS NULL OR (start_year >= 1950 AND start_year <= 2100)),
  end_month INTEGER CHECK (end_month IS NULL OR (end_month >= 1 AND end_month <= 12)),
  end_year INTEGER CHECK (end_year IS NULL OR (end_year >= 1950 AND end_year <= 2100)),
  is_current BOOLEAN DEFAULT false,
  description TEXT,
  bullets JSONB DEFAULT '[]'::jsonb,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Structured professional experience bullets
CREATE TABLE IF NOT EXISTS public.professional_experience_bullets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id UUID NOT NULL REFERENCES public.professional_experiences(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Alter career_profiles for backward compatibility and cached sync
ALTER TABLE public.career_profiles ADD COLUMN IF NOT EXISTS strengths TEXT[] DEFAULT '{}'::text[];
ALTER TABLE public.career_profiles ADD COLUMN IF NOT EXISTS strength_reflection TEXT;

-- 9. Row Level Security
ALTER TABLE public.personal_strengths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_personal_strengths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_experience_bullets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'personal_strengths' AND policyname = 'personal_strengths_read_all') THEN
    CREATE POLICY personal_strengths_read_all ON public.personal_strengths FOR SELECT USING (auth.role() IN ('authenticated', 'anon'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_personal_strengths' AND policyname = 'user_personal_strengths_owner_all') THEN
    CREATE POLICY user_personal_strengths_owner_all ON public.user_personal_strengths FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'skills' AND policyname = 'skills_read_all') THEN
    CREATE POLICY skills_read_all ON public.skills FOR SELECT USING (auth.role() IN ('authenticated', 'anon'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_roles' AND policyname = 'job_roles_read_all') THEN
    CREATE POLICY job_roles_read_all ON public.job_roles FOR SELECT USING (auth.role() IN ('authenticated', 'anon'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'locations' AND policyname = 'locations_read_all') THEN
    CREATE POLICY locations_read_all ON public.locations FOR SELECT USING (auth.role() IN ('authenticated', 'anon'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'professional_experiences' AND policyname = 'professional_experiences_owner_all') THEN
    CREATE POLICY professional_experiences_owner_all ON public.professional_experiences FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'professional_experience_bullets' AND policyname = 'professional_experience_bullets_owner_all') THEN
    CREATE POLICY professional_experience_bullets_owner_all ON public.professional_experience_bullets FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
