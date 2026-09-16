import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Welcome email once-only semantics: the marker UPDATE with IS NULL guard
 * decides whether the send happens. A replay (marker already set) or a
 * failed marker write must not trigger a second welcome email, and an email
 * send failure must never throw back into the caller.
 */

const { sendWelcomeEmail } = vi.hoisted(() => ({ sendWelcomeEmail: vi.fn() }));
const updateChain = vi.hoisted(() => ({
  update: vi.fn(),
}));

vi.mock('@/lib/email/resend', () => ({ sendWelcomeEmail }));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: () => updateChain,
  },
}));

import { sendWelcomeEmailOnce } from '@/lib/email/welcome';

function chainReturning(result: unknown, error: unknown = null) {
  updateChain.update.mockReturnValue({
    eq: vi.fn(() => ({
      is: vi.fn(() => ({
        select: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: result, error })),
        })),
      })),
    })),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sendWelcomeEmail.mockResolvedValue({ ok: true });
});

describe('sendWelcomeEmailOnce', () => {
  it('sends the welcome email exactly once when the marker flips', async () => {
    chainReturning({ full_name: 'Ada Okafor' });
    await sendWelcomeEmailOnce('u1', 'ada@example.com');
    expect(updateChain.update).toHaveBeenCalledWith({ welcome_email_sent_at: expect.any(String) });
    expect(sendWelcomeEmail).toHaveBeenCalledTimes(1);
    expect(sendWelcomeEmail).toHaveBeenCalledWith('ada@example.com', 'Ada Okafor');
  });

  it('does not send when the marker is already set (replay)', async () => {
    chainReturning(null);
    await sendWelcomeEmailOnce('u1', 'ada@example.com');
    expect(sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it('does not send when the marker write errors', async () => {
    chainReturning(null, new Error('rls'));
    await sendWelcomeEmailOnce('u1', 'ada@example.com');
    expect(sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it('does not throw when the DB call explodes', async () => {
    updateChain.update.mockImplementation(() => {
      throw new Error('network');
    });
    await expect(sendWelcomeEmailOnce('u1', 'ada@example.com')).resolves.toBeUndefined();
    expect(sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it('does nothing without an email address', async () => {
    await sendWelcomeEmailOnce('u1', null);
    expect(updateChain.update).not.toHaveBeenCalled();
  });
});
