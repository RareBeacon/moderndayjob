# Jobiest Repository - Agent Entry Point

The Next.js 15 App Router application lives in `ai-career-agent-coding-agent/ai-career-agent-coding-agent/`.

Before making any code, schema, test, or CI/CD change, read the authoritative project documentation inside `ai-career-agent-coding-agent/ai-career-agent-coding-agent/`:

1. `AGENTS.md` - Mandatory coding agent operating rules and preserved invariants
2. `ENGINEERING_STANDARDS.md` - Permanent 20-point engineering reliability and security standards
3. `ARCHITECTURE.md` - 15-domain system map and authoritative sources of truth
4. `AUTHENTICATION.md` - Auth flows, PKCE OAuth, MFA, and 30m/7d session lifecycle
5. `DATABASE.md` - Live 58-table PostgreSQL schema, RLS policies, triggers, RPCs, and storage
6. `TESTING.md` - TypeScript, Vitest, security-baseline, and Playwright E2E verification rules
7. `DEPLOYMENT.md` - Pre-deployment pipeline, Vercel preview/production gates, and rollback procedures

Root CI/security configuration lives at `.github/workflows/ci.yml`, `.github/workflows/security-scan.yml`, `.gitleaks.toml`, and `.zap/baseline-rules.conf`.
