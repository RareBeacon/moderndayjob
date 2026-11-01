# Jobiest AI Interview Intelligence Engine Architecture

## 1. Overview & Governing Principles

The **Jobiest AI Interview Intelligence Engine** (`lib/talent-pool/intelligence/`) powers individualized candidate profiling, candidate-isolated Retrieval-Augmented Generation (RAG), personalized question generation, live adaptive follow-up interviewing, and rubric-grounded competency evaluation for the Jobiest Talent Pool.

Five strict engineering invariants govern every layer:

1. **Zero breaking changes to existing Jobiest**: Reuses existing Supabase PostgreSQL (`pgvector`), `packages/ai/gateway.ts` (`Ollama` primary -> `OpenRouter` / `Cloudflare Workers AI` fallback), `ai_usage` cost ledger, and `career-documents` storage without charging candidate subscription credits.
2. **Zero new paid SaaS dependencies**: Uses open-source `@langchain/core` and `@langchain/langgraph` inside the existing Next.js 15 runtime plus PostgreSQL `pgvector` (`supabase/migrations/051_talent_rag_and_langgraph_checkpoints.sql`).
3. **Genuine personalization, never canned templates**: Every interview blueprint is derived from the candidate's verified onboarding snapshot, extracted CV evidence, career category, and seniority level, and validated through a 10-check quality gate before a session starts.
4. **Mandatory human decision authority**: Every Prompt D evaluation outputs `human_review_required: true` and `ai_auto_decision_permitted: false`. Submissions transition strictly to `UNDER_ADMIN_REVIEW` for authorized Jobiest administrators.
5. **Fairness, accessibility, and untrusted-input defense**: Zero protected-characteristic or biometric inference; full parity for `ACCESSIBLE_WRITTEN` alongside `VOICE_ONLY` and `VIDEO_VOICE`; all candidate-supplied text is defanged and isolated inside `<untrusted_input>` blocks.

---

## 2. Module Map (`lib/talent-pool/intelligence/`)

| Module | Responsibility |
|---|---|
| `data-completion-gate.ts` | Extracts structured CV facts, cross-checks against onboarding profile, detects contradictions (timeline, seniority vs years, missing master CV), preserves `declared` vs `extracted` vs `verified` claims without fabricating skills, and persists versioned `talent_assessment_contexts`. |
| `rag-engine.ts` | 9-stage RAG ingestion & retrieval pipeline (`UPLOAD -> VALIDATION -> EXTRACTION -> NORMALIZATION -> CHUNKING -> METADATA -> EMBEDDING -> VECTOR STORAGE -> INDEX`) with PII minimization (`minimizeRagPii`), deterministic/provider `vector(384)` embeddings, and `JobiestIsolatedLangChainRetriever` enforcing pre-retrieval `candidate_user_id` isolation across `CANDIDATE_KNOWLEDGE`, `JOB_COMPETENCY_KNOWLEDGE`, and `ASSESSMENT_KNOWLEDGE`. |
| `prompts/prompt-a-analyst.ts` | **System Prompt A (`2026-11.1`)**: Candidate Profile Intelligence Analyst. Produces structured `CandidateIntelligenceAnalysis` (primary/secondary skills, seniority calibration signals, claim verification priorities, role competency weights). |
| `prompts/prompt-b-architect.ts` | **System Prompt B (`2026-11.1`)**: Personalized Interview Question Architect. Generates 10-20 seniority-calibrated questions across Categories `A` through `J` with 4-band rubrics (`85-100`, `70-84`, `50-69`, `0-49`), source citations, and follow-up strategies. |
| `question-quality-gate.ts` | **10-Check Blueprint Quality Gate**: Enforces non-duplication, source-reference grounding, anti-hallucination (no unverified employers/credentials treated as fact), prohibited-topic blocking, category diversity, seniority calibration, and rubric completeness. |
| `prompts/prompt-c-interviewer.ts` | **System Prompt C (`2026-11.1`)**: Real-Time AI Interviewer. Evaluates live candidate turns, asks contextual follow-ups referencing named tools/metrics when answers use vague `"we"` framing, requests polite audio repeats on clipped STT (`< 0.45`), and blocks prompt-injection attempts. |
| `prompts/prompt-d-evaluator.ts` | **System Prompt D (`2026-11.1`)**: Independent Assessment Evaluator. Scores 7 role-weighted dimensions (`0-100`), isolates technical/audio issues (`technical_issue_affected: true`), enforces `human_review_required: true`, and builds the **Sections A to O Comprehensive Admin Assessment Report**. |
| `langgraph-workflow.ts` | **16-Node Stateful `@langchain/langgraph` `StateGraph`**: Orchestrates `PREPARE_SESSION`, `CONDUCT_TURN`, `FINALIZE_AND_SUBMIT`, and `FULL_PIPELINE` with `MemorySaver` + `talent_workflow_checkpoints` persistence, idempotency receipts, and non-repeating resume after interruption. |
| `media-transport.ts` | Provider-replaceable STT/TTS/camera/recording transport (`Cloudflare Whisper` -> `OpenAIWhisperSttAdapter` -> browser Web Speech -> `ACCESSIBLE_WRITTEN` fallback). |
| `cost-tracker.ts` | Tiered task routing (`FAST_TIER` vs `REASONING_TIER`), latency/token/USD cost estimation, and persistence to `public.ai_usage`. |

---

## 3. 16-Node LangGraph Workflow

```text
START
  -> 1. LOAD_CANDIDATE_PROFILE
  -> 2. VALIDATE_PROFILE_COMPLETENESS --(missing fields / unconfirmed CV contradiction)--> END [AWAITING_CANDIDATE_CONFIRMATION]
  -> 3. INGEST_OR_REFRESH_CANDIDATE_DOCUMENTS
  -> 4. RETRIEVE_CANDIDATE_CONTEXT (strict candidateId pre-retrieval filter)
  -> 5. RETRIEVE_ROLE_COMPETENCIES
  -> 6. ANALYZE_CANDIDATE (Prompt A)
  -> 7. GENERATE_INTERVIEW_BLUEPRINT (Prompt B)
  -> 8. VALIDATE_QUESTION_QUALITY --(unrecoverable gate error)--> END [FAILED]
  -> 9. CREATE_INTERVIEW_SESSION --(phase == PREPARE_SESSION)--> END [AWAITING_CANDIDATE_ANSWER]
  -> 10. CONDUCT_INTERVIEW --(network/media drop)--> END [PAUSED_INTERRUPTION]
  -> 11. TRANSCRIBE_RESPONSES
  -> 12. GENERATE_ADAPTIVE_FOLLOW_UP (Prompt C) --(phase == CONDUCT_TURN)--> END [AWAITING_CANDIDATE_ANSWER]
  -> 13. VALIDATE_INTERVIEW_COMPLETION --(< 70% substantive or paused)--> END [FAILED / PAUSED_INTERRUPTION]
  -> 14. EVALUATE_RESPONSES (Prompt D, 7 role-weighted dimensions)
  -> 15. GENERATE_ASSESSMENT_REPORT (Sections A to O)
  -> 16. SUBMIT_FOR_HUMAN_REVIEW (idempotent receipt, status -> UNDER_ADMIN_REVIEW)
  -> END [COMPLETED]
```

---

## 4. Database Schema (`051_talent_rag_and_langgraph_checkpoints.sql`)

All tables enforce Row-Level Security (`enable row level security`) with zero permissive `using (true)` policies:

- `public.talent_rag_documents`: Normalized, PII-minimized document registry (`CANDIDATE_KNOWLEDGE`, `JOB_COMPETENCY_KNOWLEDGE`, `ASSESSMENT_KNOWLEDGE`) with SHA-256 content hashes for idempotent re-indexing.
- `public.talent_rag_chunks`: Chunk store with `embedding vector(384)`, HNSW cosine index, and metadata JSONB.
- `public.match_talent_rag_chunks(...)`: `SECURITY DEFINER` (`SET search_path = public`) vector similarity RPC that raises `CANDIDATE_ID_REQUIRED_FOR_CANDIDATE_NAMESPACE` if `CANDIDATE_KNOWLEDGE` is queried without an explicit `p_candidate_user_id`.
- `public.talent_assessment_contexts`: Versioned Data Completion Gate snapshots (`declared` vs `extracted` vs `contradictions`).
- `public.talent_interview_blueprints`: Versioned Prompt A/B blueprints and Question Quality Gate reports (admin-only RLS so rubrics and unasked questions are never leaked pre-interview).
- `public.talent_workflow_checkpoints`: LangGraph checkpoint state, idempotency keys, token counts, latency, and estimated USD cost.
