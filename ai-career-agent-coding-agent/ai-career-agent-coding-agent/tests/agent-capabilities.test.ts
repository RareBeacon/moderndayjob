import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkCapability, declaredCapabilities, agentDryRun } from '../lib/agent/capabilities';

/**
 * Capability policy engine (B-220): deny by default. An undeclared capability
 * is refused no matter what the caller asks for; declared external side
 * effects honor the global automation kill switch and the dry-run switch.
 */

const ctx = (over: Partial<Parameters<typeof checkCapability>[1]> = {}) => ({
  automationEnabled: true,
  dryRun: false,
  ...over,
});

describe('checkCapability (B-220)', () => {
  it('allows a declared, enabled capability', () => {
    expect(checkCapability('application.auto_submit', ctx())).toEqual({
      allowed: true,
      capability: 'application.auto_submit',
    });
  });

  it('denies undeclared capabilities by default (closed registry)', () => {
    for (const rogue of [
      'shell.exec',
      'file.read',
      'http.request',
      'email.send',
      'payment.charge',
      'job_board.read ',
      'APPLICATION.AUTO_SUBMIT',
      '',
    ]) {
      const d = checkCapability(rogue, ctx());
      expect(d.allowed).toBe(false);
      if (!d.allowed) expect(d.reason).toBe('UNKNOWN_CAPABILITY');
    }
  });

  it('the kill switch blocks auto submit (B-224)', () => {
    const d = checkCapability('application.auto_submit', ctx({ automationEnabled: false }));
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toBe('AUTOMATION_DISABLED');
  });

  it('dry-run blocks every external side effect but keeps read-only work', () => {
    const submit = checkCapability('application.auto_submit', ctx({ dryRun: true }));
    expect(submit.allowed).toBe(false);
    if (!submit.allowed) expect(submit.reason).toBe('DRY_RUN');

    const read = checkCapability('job_board.read', ctx({ dryRun: true }));
    expect(read.allowed).toBe(true);
  });

  it('a disabled job source blocks board reads for that source (B-224 per-source)', () => {
    const d = checkCapability('job_board.read', ctx({ sourceEnabled: false }));
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toBe('SOURCE_DISABLED');
  });

  it('declaredCapabilities is a small, explicit allowlist', () => {
    const caps = declaredCapabilities();
    expect(caps).toEqual([
      'job_board.read',
      'job_board.fetch_page',
      'document.generate',
      'application.auto_submit',
      'application.email_handoff',
    ]);
  });
});

describe('agentDryRun (B-224)', () => {
  afterEach(() => { delete process.env.AGENT_DRY_RUN; });

  it('defaults to false (no dry run)', () => {
    delete process.env.AGENT_DRY_RUN;
    expect(agentDryRun()).toBe(false);
  });

  it('is exactly the string true', () => {
    process.env.AGENT_DRY_RUN = 'true';
    expect(agentDryRun()).toBe(true);
    process.env.AGENT_DRY_RUN = '1';
    expect(agentDryRun()).toBe(false);
  });
});
