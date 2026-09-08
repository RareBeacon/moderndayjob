import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAutomationEnabled } from '@/lib/applications/service';

/**
 * Autonomous-submission kill switch (Phase 9). The browser never decides
 * whether automation may run: only the server-side AUTOMATION_SUBMIT_ENABLED
 * env var does, and it must be exactly the string 'true'. Any other value —
 * including '1', 'TRUE', or a stray space — must keep automation OFF.
 */

describe('isAutomationEnabled (AUTOMATION_SUBMIT_ENABLED)', () => {
  it('stays OFF when the variable is unset', () => {
    delete process.env.AUTOMATION_SUBMIT_ENABLED;
    expect(isAutomationEnabled()).toBe(false);
  });

  it.each(['', '0', '1', 'TRUE', 'True', 'yes', 'enabled', 'true ', ' true', 'TRUE '])(
    'stays OFF for the non-exact value %j',
    (value) => {
      vi.stubEnv('AUTOMATION_SUBMIT_ENABLED', value);
      expect(isAutomationEnabled()).toBe(false);
    },
  );

  it("enables ONLY on the exact string 'true'", () => {
    vi.stubEnv('AUTOMATION_SUBMIT_ENABLED', 'true');
    expect(isAutomationEnabled()).toBe(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
});
