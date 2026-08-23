# Security Architecture

## Zero-trust application model
The browser is untrusted. Premium state, quotas, subscription status, workspace membership and application authorization are calculated server-side.

## Identity and abuse prevention
- Verified email before meaningful account use.
- Per-endpoint rate limits (signup, login, AI, application, payment).
- Account risk signals: email/name similarity, signup IP hash, device/session signals, payment identity and usage patterns.
- Duplicate accounts are flagged for admin review; same name/IP alone is never treated as proof of identity.
- Admin can terminate one or related accounts; termination revokes practical access by checking `profiles.account_status` on API requests and cancels queued tasks.

## Billing
- Flutterwave is authoritative for payment confirmation only after server-side verification.
- Webhook signature verification is mandatory.
- Webhook event IDs are unique and idempotent.
- Transaction status, amount, currency and reference are verified server-side.
- Flutterwave secret credentials never reach the browser.

## AI credentials
- Each user can have a separate OpenRouter and/or Hugging Face credential.
- Credentials are encrypted at rest with AES-256-GCM.
- Only server/worker processes can decrypt them.
- Full keys are never returned to the UI or logs.

## Tenant isolation
Supabase Postgres RLS protects user-owned tables. Server-side service-role access is only used in trusted backend routes/workers and never exposed to clients.

## Browser automation
- Isolated Playwright browser worker.
- No database master credentials in browser workers.
- External URLs are validated against SSRF targets before navigation.
- Tasks are idempotent and quota-reserved atomically.

## File safety
Uploaded CVs are private, size/MIME/signature validated and delivered through authorized signed URLs.

## Secrets
Production secrets live only in Render secret environment variables or an equivalent secret manager. Never commit them to GitHub. GitHub PATs are least-privilege and rotated after bootstrap work.
