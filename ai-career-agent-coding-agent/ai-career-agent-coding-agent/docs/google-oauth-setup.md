# Google sign-in setup (one owner step)

The full flow is implemented and deployed: "Continue with Google" on
/login and /signup, OAuth callback at /auth/callback, and the required
email verification gate at /verify-email for google-created accounts
(6-digit code, 10 minute expiry, 8 attempt limit, hashed at rest).

STATUS 2026-09-16: the OAuth client credentials were supplied and
APPLIED via the management API (external_google_enabled = true, client id
+ secret set). Live probe: the authorize endpoint 302-redirects to
accounts.google.com with state and the correct callback, so the Supabase
side is done.

ONE step remains, in the Google Cloud Console (owner-only): the OAuth
client was created with NO authorized redirect URIs, so Google will
reject the round trip with redirect_mismatch until this is added.

## 1. Create the OAuth client (DONE) - only the redirect URI is missing

The client exists (id 15475513822-cmsavnna...). In the console:
APIs and Services -> Credentials -> the OAuth client -> Authorized
redirect URIs -> ADD:

    https://cbxloutahmalorumaihc.supabase.co/auth/v1/callback

Also check the OAuth consent screen: while it is in testing mode, only
accounts listed as test users can sign in (add your Gmail, or publish
the app; email/profile scopes verify quickly).

## Historical steps (already done)

1. Open https://console.cloud.google.com/ and create (or pick) a project.
2. APIs and Services -> OAuth consent screen:
   - User type: External, app name "Jobiest", support email, developer email.
   - Scopes: email, profile, openid (the defaults). No sensitive scopes.
   - Add your own Gmail as a test user if the consent screen stays in
     testing mode (publishing removes the tester cap; new apps with only
     email/profile scopes verify quickly).
3. APIs and Services -> Credentials -> Create credentials -> OAuth client ID:
   - Application type: Web application
   - Authorized redirect URI (exactly this, one line):
     `https://cbxloutahmalorumaihc.supabase.co/auth/v1/callback`
   - Authorized JavaScript origins: `https://jobiest.com`
4. Copy the Client ID and Client secret.

## 2. Configure Supabase (paste or ask the agent)

Either in Supabase Studio -> Authentication -> Providers -> Google, or hand
the two values to the workspace agent (it applies them via the management
API with `external_google_enabled = true`).

## 3. Verify

- Open https://jobiest.com/login -> "Continue with Google" -> consent.
- A first-time google account lands on /verify-email with a 6-digit code
  in the inbox; entering it unlocks the dashboard.
- Returning google users go straight to /dashboard.
- Password accounts are untouched (instant access, no gate).

## Failure modes

| Symptom | Meaning |
| --- | --- |
| "Google sign-in is not enabled yet" on click | Provider not configured in Supabase yet |
| redirect_mismatch at Google | Redirect URI in the OAuth client differs from the exact one above |
| access_denied | Consent screen in testing mode and the Google account is not a test user |

Security notes: sessions are server-validated on every request; the
verification gate is keyed on the session's google provider claim; codes
are HMAC-SHA256 hashed with the encryption master key and the table is
service-role only; middleware gates pages and the API gates data.
