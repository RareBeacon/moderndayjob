import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * First-win activation nudge (2026-10-05), batch semantics:
 *  - candidates = email-verified (welcome marker set) + nudge marker NULL +
 *    account >= 3 days old;
 *  - anyone with a usage_daily row (used any feature) is excluded;
 *  - the set-once marker claim (UPDATE ... IS NULL) gates the send, so a
 *    replay or a lost race can never double-send;
 *  - a failed email send counts as skipped and never throws.
 */

const { sendFirstWinEmail } = vi.hoisted(() => ({ sendFirstWinEmail: vi.fn() }));

const profilesChain = vi.hoisted(() => ({ select: vi.fn(), update: vi.fn() }));
const usageChain = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock('@/lib/email/resend', () => ({ sendFirstWinEmail }));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => (table === 'usage_daily' ? usageChain : profilesChain)),
  },
}));

import { sendFirstWinEmails } from '@/lib/email/first-win';

const CANDIDATES = [
  { user_id: 'u1', full_name: 'Ada Okafor', email: 'ada@example.com' },
  { user_id: 'u2', full_name: 'Bola Ahmed', email: 'bola@example.com' },
];

function setupCandidates(data: unknown[], error: unknown = null) {
  profilesChain.select.mockImplementation(() => ({
    not: () => ({
      is: () => ({
        lte: () => ({
          order: () => ({
            limit: vi.fn(async () => ({ data, error })),
          }),
        }),
      }),
    }),
  }));
}

function setupUsage(rows: unknown[]) {
  usageChain.select.mockImplementation(() => ({
    in: vi.fn(async () => ({ data: rows, error: null })),
  }));
}

function setupClaim(returnsData: boolean) {
  profilesChain.update.mockImplementation(() => ({
    eq: () => ({
      is: () => ({
        select: () => ({
          maybeSingle: vi.fn(async () => ({ data: returnsData ? { user_id: 'x' } : null, error: null })),
        }),
      }),
    }),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  sendFirstWinEmail.mockResolvedValue({ ok: true });
});

describe('sendFirstWinEmails', () => {
  it('sends to a dormant user and skips an active user', async () => {
    setupCandidates(CANDIDATES);
    setupUsage([{ user_id: 'u2' }]); // u2 used the product
    setupClaim(true);
    const report = await sendFirstWinEmails();
    expect(report).toEqual({ candidates: 2, sent: 1, skipped: 1 });
    expect(sendFirstWinEmail).toHaveBeenCalledTimes(1);
    expect(sendFirstWinEmail).toHaveBeenCalledWith('ada@example.com', 'Ada Okafor');
  });

  it('sends nothing when there are no candidates', async () => {
    setupCandidates([]);
    setupUsage([]);
    const report = await sendFirstWinEmails();
    expect(report).toEqual({ candidates: 0, sent: 0, skipped: 0 });
    expect(sendFirstWinEmail).not.toHaveBeenCalled();
  });

  it('skips a candidate whose email is missing (no claim, no send)', async () => {
    setupCandidates([{ user_id: 'u1', full_name: 'No Email', email: null }]);
    setupUsage([]);
    setupClaim(true);
    const report = await sendFirstWinEmails();
    expect(report).toEqual({ candidates: 1, sent: 0, skipped: 1 });
    expect(profilesChain.update).not.toHaveBeenCalled();
    expect(sendFirstWinEmail).not.toHaveBeenCalled();
  });

  it('does not send when the marker claim loses the race (already sent)', async () => {
    setupCandidates(CANDIDATES);
    setupUsage([]);
    setupClaim(false);
    const report = await sendFirstWinEmails();
    expect(report).toEqual({ candidates: 2, sent: 0, skipped: 2 });
    expect(sendFirstWinEmail).not.toHaveBeenCalled();
  });

  it('counts a failed send as skipped and never throws', async () => {
    setupCandidates([CANDIDATES[0]]);
    setupUsage([]);
    setupClaim(true);
    sendFirstWinEmail.mockResolvedValue({ ok: false, error: 'RESEND_500' });
    const report = await sendFirstWinEmails();
    expect(report).toEqual({ candidates: 1, sent: 0, skipped: 1 });
  });

  it('bails out safely on a query error (column missing, DB down)', async () => {
    setupCandidates([], { message: 'column profiles.first_win_email_sent_at does not exist' });
    const report = await sendFirstWinEmails();
    expect(report).toEqual({ candidates: 0, sent: 0, skipped: 0 });
    expect(sendFirstWinEmail).not.toHaveBeenCalled();
  });
});
