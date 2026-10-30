'use client';

import { useEffect, useState } from 'react';
import { startOAuth } from '@/lib/auth/oauth';

function isNextRedirect(err: unknown): boolean {
  if (err && typeof err === 'object' && 'digest' in err) {
    const digest = (err as { digest?: unknown }).digest;
    if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) return true;
  }
  return err instanceof Error && err.message === 'NEXT_REDIRECT';
}

export function LinkedInButton() {
  const [error, setError] = useState('');
  const [nextPath, setNextPath] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setNextPath(new URLSearchParams(window.location.search).get('next') || '');
  }, []);

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <form
        action={async (formData: FormData) => {
          setError('');
          setPending(true);
          try {
            await startOAuth(formData);
          } catch (e: unknown) {
            if (isNextRedirect(e)) throw e;
            setPending(false);
            const msg = e instanceof Error ? e.message : String(e);
            const unavailable = /provider|support|enabled|invalid|not found/i.test(msg);
            setError(
              unavailable
                ? 'LinkedIn sign-in is not enabled yet. Use email and password for now.'
                : 'Could not start LinkedIn sign-in. Please try again.',
            );
          }
        }}
      >
        <input type="hidden" name="provider" value="linkedin_oidc" />
        <input type="hidden" name="next" value={nextPath} />
        <button type="submit" className="google-btn" disabled={pending}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}>
            <path fill="#0A66C2" d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45Z" />
          </svg>
          {pending ? 'Redirecting to LinkedIn…' : 'Continue with LinkedIn'}
        </button>
      </form>
      {error ? (
        <div className="auth-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
