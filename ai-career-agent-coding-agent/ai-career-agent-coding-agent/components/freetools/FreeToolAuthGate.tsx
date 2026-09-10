'use client';

import Link from 'next/link';
import type { FreeToolConfig } from '@/lib/free-tools/config';

export function FreeToolAuthGate({
  tool,
  action,
  onClose,
  track,
}: {
  tool: FreeToolConfig;
  action: 'copy' | 'download' | 'save';
  onClose: () => void;
  track: (eventName: string, metadata?: Record<string, unknown>) => void;
}) {
  const next = typeof window !== 'undefined'
    ? `${window.location.pathname}?unlock=${encodeURIComponent(action)}`
    : tool.route;
  const title = action === 'copy'
    ? 'Create your free Jobiest account to copy and keep it.'
    : action === 'download'
      ? 'Create your free Jobiest account to download your result.'
      : 'Create your free Jobiest account to save your result.';

  return (
    <div className="ft2-gate" role="dialog" aria-modal="true" aria-labelledby="ft2-gate-title">
      <div className="ft2-gate-card">
        <button className="ft2-gate-close" type="button" onClick={onClose} aria-label="Close">×</button>
        <span className="mk-kicker">Your work is ready</span>
        <h2 id="ft2-gate-title">{title}</h2>
        <p>
          You can preview the result now. Create a free account or sign in to unlock copy,
          download and save. Your generated content will stay in this browser and return after authentication.
        </p>
        <div className="ft2-gate-actions">
          <Link
            className="btn"
            href={`/signup?next=${encodeURIComponent(next)}`}
            onClick={() => track('free_tool_signup_started', { action })}
          >
            Create Free Account
          </Link>
          <Link className="btn secondary" href={`/login?next=${encodeURIComponent(next)}`}>
            I already have an account
          </Link>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
          Free means free. No payment is required to unlock this {tool.name.toLowerCase()} result.
        </p>
      </div>
    </div>
  );
}
