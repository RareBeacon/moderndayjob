# AI Career Agent v10

Production-oriented multi-tenant AI career/job-application SaaS foundation.

**Start with `START_HERE.md`.** Coding agents should then read `AGENTS.md` and `docs/CODING_AGENT.md`.

## Product model
- Free forever: 3 AI documents in total (not daily), 10 career-tool uses/day, manual apply only.
- Basic: NGN 5,000/month, 3 AI documents/day, 2 lifetime auto-apply trial uses, 50 tool uses/day.
- Premium: NGN 10,000/month, 10 AI documents/day, 10 auto-apply slots/day (agent mode), unlimited tools.
- Max: NGN 20,000/month, 20 AI documents/day, 20 auto-apply slots/day (agent mode), unlimited everything.
- Flutterwave payments.
- Per-user/workspace OpenRouter and Hugging Face credentials, encrypted at rest.
- User-supplied application email only; no Gmail/inbox access.
- Render deployment with separate web, agent, browser and scheduler services.

## Important
This repository is an implementation foundation. Site-specific browser adapters, production provider configuration, complete E2E coverage and live autonomous submission must be completed and tested before enabling real-world automated applications.
