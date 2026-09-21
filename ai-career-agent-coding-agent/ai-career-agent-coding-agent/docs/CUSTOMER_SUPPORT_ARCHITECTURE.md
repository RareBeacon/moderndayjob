# Customer Support Architecture (Workstream B)

Deployed: 2026-09-21, commit a40b370 (CI green, Vercel success, live-verified).

## 1. Components

| Layer | Implementation |
|---|---|
| Widget | `components/support/ChatWidget.tsx` + CSS module; mounted in the root layout so it renders on every route (marketing, blog, tools, auth, app, admin) |
| Chat API | `POST /api/support/chat` (rate limited 15/min/IP) |
| Ticket API | `POST /api/support/tickets` (rate limited 5/hour/IP) |
| Agent | `lib/support/agent.ts`: SUPPORT_CHAT_TASK v1 on the existing model gateway (Ollama primary, Cloudflare Workers AI fallback, OpenRouter disaster switch), server-side only |
| Knowledge base | `lib/support/kb.ts` (20 KB-xxx entries, live-app verified) + `support_kb_entries` table (seeded) |
| Storage | Migration 029: `support_conversations`, `support_chat_messages` (chat; distinct from the 026 contact-form `support_messages`), `support_tickets`, `support_kb_entries`, `support_analytics_events` |
| Admin | `/admin/support` (admin_users-gated): ticket table, conversation volume, deflection analytics, escalation reference |
| Email | Resend to support@jobiest.com with reply-to preserved; status recorded per ticket |

## 2. Data flow

1. Visitor opens the widget (fixed launcher, draggable, position persisted in localStorage).
2. Each message POSTs to the chat route: rate limit, conversation created or resumed (ownership checked), user message persisted, deterministic escalation check, KB retrieval (token overlap), model call with the versioned system prompt and injection-defended inputs, assistant message persisted with escalation flag, analytics event recorded.
3. On escalation (or the Talk to a human button), the ticket form appears: email, category (8 standard categories), subject, message.
4. Ticket route: validation, DB write FIRST (JBT-YYYYMMDD-XXXX, collision-retried), then email attempt, then email status update; only then is the ticket ID reported to the user.
5. Admin views tickets, conversations, and analytics at /admin/support.

## 3. Honesty and safety rules

- The agent answers only from the KB and conversation; it never claims actions it did not perform (no resets, refunds, sends, or account changes).
- Model unavailability produces an honest "I could not reach the assistant" response plus escalation, never a fabricated answer.
- User text is untrusted: length-capped, injection-patterns neutralized (`lib/ai/injection.ts`), wrapped in UNTRUSTED delimiters; the system prompt forbids following embedded instructions.
- All five support tables are service-role only (RLS on, anon/authenticated revoked); the widget never touches the database directly.
- Rate limits on both public endpoints; admin surfaces gated behind admin_users.

## 4. Escalation triggers (all deterministic, pre- and post-model)

Billing/payment keywords; security concerns; data requests (deletion, export, GDPR); account lockout; three exchanges without resolution; explicit human request. Verified live: a refund question returned escalate=true with reason BILLING_OR_PAYMENT.

## 5. Known characteristics

- Round-trip latency is currently 85 to 110 seconds because the primary self-hosted model runs on modest hardware; the widget shows a typing state during waits. The Cloudflare fallback engages automatically if the primary is down. Faster dedicated inference hardware would reduce this.
- Email delivery status SENT means Resend accepted the message; final inbox receipt was smoke-tested with ticket JBT-20260921-NMJ4 (user confirmation of inbox receipt closes the B1 mailbox verification).
