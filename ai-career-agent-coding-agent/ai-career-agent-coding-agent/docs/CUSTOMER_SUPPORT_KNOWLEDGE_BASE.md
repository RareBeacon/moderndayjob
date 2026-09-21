# Support Knowledge Base (Workstream B, B3)

Source of truth: `lib/support/kb.ts` (20 entries, KB-001 to KB-020), seeded to the `support_kb_entries` table (live_url_verified = true, verified 2026-09-21). Every entry states only what the live application actually does; no feature, price, or behavior is documented that the product does not have.

## Entry catalog

| ID | Question | Topics |
|---|---|---|
| KB-001 | What is Jobiest? | product, overview |
| KB-002 | Is Jobiest free to use? What does it cost? | pricing, billing, plans, cost |
| KB-003 | What free tools does Jobiest offer? | tools, free |
| KB-004 | Does the ATS resume scanner cost anything? | tools, ats, scanner, resume |
| KB-005 | How does the Resume Studio work? | resume, studio, generate, documents |
| KB-006 | Can I export my resume as PDF and Word? | resume, export, pdf, docx, documents |
| KB-007 | Does Jobiest apply to jobs automatically? | agent, applications, approval, automation |
| KB-008 | Will Jobiest invent experience or skills on my CV? | truthfulness, policy, resume, cv |
| KB-009 | How do I sign up or log in? | account, login, signup, auth |
| KB-010 | How do I reset my password? | account, login, password |
| KB-011 | Where can I see my applications? | applications, dashboard, tracking |
| KB-012 | How do I update my profile or job preferences? | profile, preferences, dashboard |
| KB-013 | What payment methods does Jobiest accept? | billing, payment, pricing |
| KB-014 | How do I delete my account or my data? | privacy, data, account, deletion |
| KB-015 | Is my data private? | privacy, security, policy |
| KB-016 | Does Jobiest have a mobile app? | mobile, app, product |
| KB-017 | What is a resume match score? | score, resume, match, ats |
| KB-018 | Can Jobiest help with cover letters and LinkedIn? | cover letter, linkedin, summary, tools |
| KB-019 | The AI made an error in my document. What do I do? | documents, ai, errors |
| KB-020 | How do I contact a human? | support, contact, human, ticket |

## Verification notes

- Pricing facts (free plan with 3 AI generations; Basic 5,000 / Premium 10,000 / Max 20,000 Naira monthly) verified against the live pricing page.
- Tool lists verified against the live sitemap and tool pages.
- Approval-control and truthfulness statements match the product's published commitments.
- KB-006 answer verified live: the agent answered the Word-export question correctly from this entry.

## Retrieval

Deterministic token-overlap retrieval (`retrieveKb`, top 4). No fabricated relevance scores. Off-topic queries return zero entries and the agent says it is not certain and offers a ticket.

## Update policy

Product changes that affect any answer require updating the entry in `lib/support/kb.ts`, re-running `scripts/seo/seed-support-kb.ts`, and keeping the unit tests green. Entries never document unreleased features.
