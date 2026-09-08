import { describe, it, expect } from 'vitest';
import { decideAutoSubmit, type AutoSubmitContext } from '../lib/apply/gate';

const good: AutoSubmitContext = {
  automationEnabled: true,
  agentPaused: false,
  appStatus: 'APPROVED',
  entitled: true,
  adapterSupported: true,
  hasEmail: true,
  hasPackage: true,
  truthfulnessOk: true,
  jobExpired: false,
};

const ctx = (over: Partial<AutoSubmitContext> = {}): AutoSubmitContext => ({ ...good, ...over });

describe('decideAutoSubmit', () => {
  it('passes when everything is in order', () => {
    expect(decideAutoSubmit(ctx())).toEqual({ ok: true });
  });

  it('is blocked by the global kill switch — first, always', () => {
    expect(decideAutoSubmit(ctx({ automationEnabled: false }))).toEqual({ ok: false, code: 'AUTOMATION_DISABLED' });
    // kill switch wins even when everything else is also wrong
    expect(decideAutoSubmit(ctx({ automationEnabled: false, appStatus: 'SUBMITTED', entitled: false }))).toEqual({ ok: false, code: 'AUTOMATION_DISABLED' });
  });

  it('is blocked by the per-user pause', () => {
    expect(decideAutoSubmit(ctx({ agentPaused: true }))).toEqual({ ok: false, code: 'AGENT_PAUSED' });
  });

  it('requires an APPROVED application', () => {
    for (const s of ['PREPARING', 'AWAITING_APPROVAL', 'SUBMITTED', 'REJECTED']) {
      expect(decideAutoSubmit(ctx({ appStatus: s })), s).toEqual({ ok: false, code: 'NOT_APPROVED' });
    }
  });

  it('requires automation entitlement', () => {
    expect(decideAutoSubmit(ctx({ entitled: false }))).toEqual({ ok: false, code: 'NOT_ENTITLED' });
  });

  it('requires a supported adapter', () => {
    expect(decideAutoSubmit(ctx({ adapterSupported: false }))).toEqual({ ok: false, code: 'UNSUPPORTED_PLATFORM' });
  });

  it('blocks expired jobs', () => {
    expect(decideAutoSubmit(ctx({ jobExpired: true }))).toEqual({ ok: false, code: 'EXPIRED_JOB' });
  });

  it('requires an email and a package', () => {
    expect(decideAutoSubmit(ctx({ hasEmail: false }))).toEqual({ ok: false, code: 'REQUIRED_FIELDS_MISSING' });
    expect(decideAutoSubmit(ctx({ hasPackage: false }))).toEqual({ ok: false, code: 'REQUIRED_FIELDS_MISSING' });
  });

  it('requires truthfulness to pass', () => {
    expect(decideAutoSubmit(ctx({ truthfulnessOk: false }))).toEqual({ ok: false, code: 'TRUTHFULNESS_ISSUE' });
  });
});
