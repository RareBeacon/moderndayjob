'use client';

import { useState } from 'react';

/**
 * Continue with LinkedIn - navigates to GET /api/auth/oauth?provider=linkedin_oidc
 * so the PKCE code-verifier cookie is set directly on the HTTP 302 response for
 * the exact current host before redirecting to LinkedIn.
 */
export function LinkedInButton() {
  const [pending, setPending] = useState(false);

  function handleClick() {
    if (pending) return;
    setPending(true);
    const params = new URLSearchParams(window.location.search);
    const next = params.get('next');
    const from = window.location.pathname === '/signup' ? '/signup' : '/login';
    const qs = new URLSearchParams({ provider: 'linkedin_oidc', from });
    if (next) qs.set('next', next);
    window.location.assign(`/api/auth/oauth?${qs.toString()}`);
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <button type="button" className="google-btn" onClick={handleClick} disabled={pending}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}>
          <path fill="#0A66C2" d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45Z" />
        </svg>
        {pending ? 'Redirecting to LinkedIn…' : 'Continue with LinkedIn'}
      </button>
    </div>
  );
}
