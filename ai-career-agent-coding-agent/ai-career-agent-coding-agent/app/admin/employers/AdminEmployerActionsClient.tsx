'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AdminEmployerActionsClient({
  organizationId,
  currentStatus,
}: {
  organizationId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function decide(decision: 'VERIFY' | 'REJECT' | 'SUSPEND') {
    let reason: string | undefined;
    if (decision !== 'VERIFY') {
      const entered = window.prompt(`Enter documented reason to ${decision.toLowerCase()} this employer (min 8 chars):`);
      if (!entered || entered.trim().length < 8) return;
      reason = entered.trim();
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/employers/${organizationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {currentStatus !== 'VERIFIED' && (
        <button type="button" disabled={busy} className="btn btn-sm" onClick={() => void decide('VERIFY')}>
          Verify
        </button>
      )}
      {currentStatus !== 'REJECTED' && (
        <button type="button" disabled={busy} className="btn btn-ghost btn-sm" onClick={() => void decide('REJECT')}>
          Reject
        </button>
      )}
      {currentStatus === 'VERIFIED' && (
        <button type="button" disabled={busy} className="btn btn-ghost btn-sm" onClick={() => void decide('SUSPEND')}>
          Suspend
        </button>
      )}
    </div>
  );
}
