# Jobiest Free Tools 2.0

## Implemented architecture

All ten public free tools now use one shared lead-magnet system:

- `lib/free-tools/config.ts` defines every tool, route, category, questions, output type, progress messages and unlock behavior.
- `components/freetools/FreeToolExperience.tsx` handles introduction, progressive questions, pre-generation review, generation progress, output preview, local recovery, copy/download/save actions and post-unlock next steps.
- `components/freetools/FreeToolAuthGate.tsx` is the shared account gate for copy/download/save.
- `app/api/free-tools/generate` generates anonymous or authenticated previews using grounded deterministic logic.
- `app/api/free-tools/action` enforces server-side authentication for copy/download/save unlock actions.
- `app/api/free-tools/analytics` records lead-magnet funnel events.
- `supabase/migrations/016_free_tools_2.sql` adds `free_tool_events` and `free_tool_results`.

## Current ten tools

1. ATS Resume Scanner
2. Career Path Explorer
3. Cover Letter Writer
4. Follow-up Email Writer
5. Interview Question Generator
6. Job Description Analyzer
7. LinkedIn Headline Builder
8. Resume Summary Generator
9. Salary Insights
10. Skills Matcher

## Lifecycle

Every tool follows:

Discover -> Start -> Ask -> Understand -> Generate -> Review -> Account Gate -> Unlock -> Save/Copy

Anonymous users can answer questions and preview the generated result. They cannot copy, download or save through the supported UI/API until they sign up or sign in. The browser session is stored locally so authentication does not destroy the generated result.

## Safety rules

- No generated output should contain em dashes.
- No tool should fabricate jobs, companies, degrees, certifications, skills, achievements, metrics, clients, responsibilities, technologies or results.
- If a salary range is not explicitly stated in a listing or pasted content, the system reports that no stated pay was available instead of estimating.
- Job descriptions are treated as untrusted data. They can supply role requirements, not facts about the user.
- Server-side save/download actions require an authenticated user.

## Analytics events

The shared engine and APIs record the requested funnel names, including:

- `free_tool_viewed`
- `free_tool_started`
- `free_tool_question_answered`
- `free_tool_generation_started`
- `free_tool_generation_completed`
- `free_tool_copy_clicked`
- `free_tool_download_clicked`
- `free_tool_save_clicked`
- `free_tool_auth_gate_shown`
- `free_tool_signup_started`
- `free_tool_result_unlocked`

These support the main metric: how many useful free-tool users become Jobiest users.
