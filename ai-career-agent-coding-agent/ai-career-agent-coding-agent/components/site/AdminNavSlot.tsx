'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

export function AdminNavSlot({ active, initialIsAdmin }: { active: string; initialIsAdmin?: boolean }) {
  const [isAdmin, setIsAdmin] = useState(initialIsAdmin ?? false);

  useEffect(() => {
    if (initialIsAdmin !== undefined) {
      setIsAdmin(initialIsAdmin);
      return;
    }
    let cancelled = false;
    fetch('/api/admin/check')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.isAdmin) {
          setIsAdmin(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialIsAdmin]);

  if (!isAdmin) return null;

  return (
    <Link
      href="/admin"
      className={`app-link${active === 'admin' ? ' active' : ''}`}
      aria-current={active === 'admin' ? 'page' : undefined}
    >
      <span className="app-ico">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="18" height="18">
          <path
            d="M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6l7-3zM9.5 12l1.8 1.8 3.4-3.6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="app-lbl">Admin Control Centre</span>
    </Link>
  );
}
