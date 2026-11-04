# Jobiest Career Intelligence Architecture

**Status:** Engineering blueprint, increment 1 implemented as an offline retrieval-evaluation foundation
**Scope:** Jobiest.com career products only
**Principle:** No new infrastructure or production data migration until a measured use case requires it.

## 1. Product objective

Build a reliable career-intelligence layer that helps a Jobiest user find relevant opportunities, understand the evidence behind a match, tailor truthful career materials, and continue work across tasks. The system should be useful with the existing model and data stack; it must not depend on a particular LLM vendor or imply that stored feedback has retrained a model.

The first objective is **evidence-grounded assistance**, not unrestricted autonomous action or a general-purpose cross-product intelligence platform.

## 2. Jobiest use cases and boundaries

| Use case | Authorized context | Expected result | Guardrail |
| --- | --- | --- | --- |
| Find suitable jobs | Public/approved job records + the signed-in user's saved career profile and preferences | Ranked openings with match reasons and current source details | Apply user/account filters before retrieval; never expose another candidate's profile |
| Tailor a resume or cover letter | User-selected resume/profile + selected job description | Draft that reuses only verified user facts | Mark missing facts; do not fabricate experience, metrics, or qualifications |
| Prepare for an interview | Selected role, user-approved profile, and relevant assessment/interview knowledge | Role-specific practice and cited preparation context | Keep assessment and employer-only candidate data out of jobseeker memory |
| Continue a task | User's explicit saved preferences and task state | Resume without repeating completed work | Provide correction/deletion; distinguish durable preference from temporary task state |

This scope excludes unrelated brands and products. It also excludes unrestricted web crawling, automatic cross-account learning, silent profile inference, automatic model training from customer outcomes, and any bypass of job-board rules or user confirmation requirements.

## 3. Current foundation in the repository

This is an inventory, not a claim that every capability is production-complete:

- `lib/talent-pool/intelligence/rag-engine.ts` has candidate-scoped ingestion and retrieval, source/version/hash metadata, PII minimization, untrusted-text defanging, hybrid lexical plus deterministic feature-hash scoring, and a LangChain retriever.
- `lib/talent-pool/intelligence/langgraph-workflow.ts` orchestrates the employer-facing Talent Pool assessment workflow; migration `051_talent_rag_and_langgraph_checkpoints.sql` contains its persistence foundation.
- Radar has job embeddings and server-side matching in its own domain and migrations. This is a job-opportunity index, not a universal user-memory store.
- `lib/support/kb.ts` is a small verified support knowledge base with constrained retrieval.
- Existing synthetic RAG isolation and Talent Pool benchmark tests are useful, but they are not a representative evaluation of jobseeker matching, resume tailoring, or interview-preparation quality.

The current `jobiest-hybrid-384-v1` representation is a deterministic feature-hashed embedding implementation, not a learned semantic embedding model. Treat its relevance as a hypothesis to benchmark, not as proof of semantic understanding. The first implementation adds standard offline ranking metrics and a small synthetic retrieval smoke benchmark; it does not alter ranking behavior.

## 4. Target architecture

### 4.1 Knowledge domains

1. **Public opportunity knowledge:** approved job postings and employer/source metadata. Store freshness, source identity, expiry, and verification status with each record.
2. **Private user career context:** profiles, user-selected resumes, skills, job preferences, saved jobs, and application history. Authoritative records remain in the existing relational database; embeddings are derived indexes, never the source of truth.
3. **Curated Jobiest guidance:** reviewed career guidance and product help with editorial provenance and review dates.
4. **Workflow state:** resumable state for a specific user's task, separate from durable user memory and from shared public knowledge.

Each knowledge object must preserve tenant/user scope, source, source identifier or location, creation/observation time, content version/hash, access policy, and a deletion/update path for derived indexes.

### 4.2 Initial storage and retrieval

Use the existing Supabase/PostgreSQL foundation and pgvector where already provisioned. Keep structured facts in relational tables and source documents in their existing storage locations. Use existing lexical/relational filters alongside vector ranking. Do not add Qdrant, Neo4j, OpenSearch, Kafka, or a paid provider in increment 1.

Retrieval order:

1. Authenticate and determine the user's authorized context.
2. Apply namespace, tenant, user, visibility, verification, and expiry filters **before scoring**.
3. Route to a narrow existing domain retriever (opportunities, user career context, or curated guidance).
4. Retrieve lexical and semantic candidates; rerank only if evaluation shows measurable benefit.
5. Return evidence with source, version/date, content hash, namespace, and score to the workflow.
6. Generate a response that distinguishes source-backed facts from recommendations or hypotheses; abstain or ask when evidence is missing.

Graph retrieval and external web research are later options, not default steps. They require a measured multi-hop/current-information use case and explicit source-policy review.

### 4.3 Memory lifecycle

- **Working memory:** current task inputs and intermediate results; task-scoped and resumable.
- **User memory:** explicit, user-controlled preferences and facts that are useful across tasks. Scope to that user, provide edit/delete paths, and set review/expiry rules for changeable facts.
- **Evidence knowledge:** source-backed public or approved facts with version and freshness metadata.
- **Outcome records:** observable task results and user feedback, stored separately from verified facts. Do not infer causality or rewrite shared knowledge from a single outcome.

Memory write flow: propose -> validate provenance and scope -> deduplicate/version -> persist under user authorization -> make retrievable -> allow correction/deletion. Do not silently convert model-generated conclusions into verified facts.

### 4.4 Orchestration and actions

Use the existing LangGraph workflows where durable state, conditional routing, retries, or approval checkpoints are needed. Use direct service calls for simple, deterministic actions. An agent may draft and recommend; user confirmation and existing server-side authorization remain required for consequential actions. No tool receives permissions broader than its task needs.

### 4.5 Trust, privacy, and security

- Enforce user/account authorization server-side and in PostgreSQL RLS; do not rely on UI gating.
- Filter private retrieval before ranking and before evidence is sent to a model.
- Treat retrieved pages and documents as untrusted data, not instructions.
- Preserve provenance and distinguish quoted evidence, extracted facts, inference, and prediction.
- Apply existing PII-minimization policies before external model calls; do not expose secrets or tokens.
- Track source licensing, terms, robots policy, rate limits, and freshness; robots rules are not access control.
- Deletion and replacement must invalidate corresponding chunks/embeddings and cached data without destructive changes to original resumes or account records.

## 5. Evaluation contract

Evaluation must precede claims of improvement. The first offline metrics are implemented in `lib/ai/evaluation/rag-metrics.ts`:

- Precision@K and Recall@K for candidate evidence coverage.
- Reciprocal Rank for the position of the first relevant result.
- NDCG@K for graded relevance.

The accompanying `tests/rag-evaluation.test.ts` validates metric edge cases and runs a deterministic, synthetic smoke benchmark through the existing candidate-scoped retriever. This is a correctness/safety smoke test, not a production quality score.

Before tuning real jobseeker ranking, curate a permissioned, de-identified evaluation set with representative Jobiest queries and human-labeled relevant evidence. Report results by use case and cohort, alongside citation support, stale-source rate, abstention behavior, latency, and cost. Keep a held-out regression set; never tune and evaluate on the same examples alone. Feedback such as clicks, saves, or applications is a noisy outcome signal, not ground truth by itself.

## 6. Staged delivery

### Increment 1 — Evaluation foundation (this change)

- Add dependency-free ranking metrics.
- Add a synthetic retrieval smoke benchmark that checks scope, provenance, and retrieval of known evidence.
- Document the existing capability boundary and target architecture.
- No schema migration, new provider, database write, or retrieval behavior change.

### Increment 2 — Jobseeker evidence contract

- Define one typed evidence envelope for job matching and career-writing workflows.
- Make match reasons traceable to job fields and user-approved profile facts.
- Add tests for missing, stale, conflicting, or unauthorized evidence and safe abstention.
- Preserve current product behavior behind existing entitlements and server authorization.

### Increment 3 — Representative evaluation

- Create a reviewed, de-identified gold set for job matching and tailoring.
- Measure ranking, grounding, factuality, and freshness before changing the ranker or prompts.
- Add regression thresholds only after baseline variance and acceptable error costs are understood.

### Increment 4 — Explicit user memory

- Define saved preference fields, user controls, retention rules, deletion propagation, and account isolation.
- Reuse existing account data where possible; do not duplicate resumes or subscriptions into a new memory database.
- Enable writes only after consent and server/RLS checks are tested.

### Increment 5 — Evidence-driven advanced retrieval

- Benchmark query rewriting, reranking, multi-hop/graph retrieval, and external search against the gold set.
- Adopt only approaches with measurable quality improvement and acceptable latency/cost/security trade-offs.

## 7. Release gates

A change is not ready to deploy unless:

1. Typecheck, unit tests, and production build pass.
2. Candidate/user isolation and RLS tests pass for affected routes.
3. Evidence has a traceable source and does not present inference as fact.
4. Existing free tools, plan benefits, pricing, and customer data remain unchanged.
5. No production Supabase migration or real-user action is run without explicit, authorized release approval.
6. Vercel reports the relevant deployment as Ready before claiming it is deployed.

## 8. Decisions intentionally deferred

- Whether to use learned embeddings or a third-party reranker.
- A separate vector or graph database.
- Continuous crawlers and scheduled external research.
- Multi-agent collaboration for ordinary user flows.
- Automatic learning or model fine-tuning from outcomes.
- A cross-product or third-party developer platform.

These require a demonstrated Jobiest use case, a benchmark, a privacy/security review, and a cost justification before implementation.
