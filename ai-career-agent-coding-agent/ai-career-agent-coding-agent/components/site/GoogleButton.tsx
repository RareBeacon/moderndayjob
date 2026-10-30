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

/**
 * Continue with Google - Server Action initiation (httpOnly PKCE verifier).
 * Rethrows Next.js redirect signals so the OAuth 303 redirect completes cleanly.
 */
export function GoogleButton() {
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
                ? 'Google sign-in is not enabled yet. Use email and password for now.'
                : 'Could not start Google sign-in. Please try again.',
            );
          }
        }}
      >
        <input type="hidden" name="provider" value="google" />
        <input type="hidden" name="next" value={nextPath} />
        <button type="submit" className="google-btn" disabled={pending}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style={{ flex: 'none' }}>
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.34A8.99 8.99 0 0 0 9 18Z" />
            <path fill="#FBBC05" d="M3.97 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.09l3.01-2.34Z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A8.99 8.99 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
          </svg>
          {pending ? 'Redirecting to Google…' : 'Continue with Google'}
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
