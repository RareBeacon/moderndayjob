import { describe, it, expect } from 'vitest';
import {
  decidePrepare,
  decideApprove,
  decideReject,
  decideWithdraw,
  decideSubmit,
  type GateContext,
  type ApplicationStatus,
} from '../lib/applications/state-machine';

const ctx = (over: Partial<GateContext> = {}): GateContext => ({
  jobExists: true,
  jobExpired: false,
  hasEmail: true,
  hasPackage: true,
  ...over,
});

describe('decidePrepare', () => {
  it('creates a new application as PREPARING when the package is incomplete', () => {
    const d = decidePrepare(null, ctx({ hasPackage: false }));
    expect(d.ok).toBe(true);
    expect(d.next).toBe('PREPARING');
  });

  it('creates straight into AWAITING_APPROVAL when the package is already complete', () => {
    const d = decidePrepare(null, ctx());
    expect(d.next).toBe('AWAITING_APPROVAL');
  });

  it('rejects an expired job', () => {
    const d = decidePrepare(null, ctx({ jobExpired: true }));
    expect(d.ok).toBe(false);
    expect(d.code).toBe('EXPIRED_JOB');
  });

  it('rejects a missing job', () => {
    const d = decidePrepare(null, ctx({ jobExists: false }));
    expect(d.code).toBe('NOT_FOUND');
  });

  it('is idempotent for applications already awaiting approval', () => {
    const d = decidePrepare('AWAITING_APPROVAL', ctx());
    expect(d.ok).toBe(true);
    expect(d.code).toBe('ALREADY_IN_STATE');
    expect(d.next).toBe('AWAITING_APPROVAL');
  });
});

describe('decideApprove', () => {
  it('approves a waiting application with a complete package', () => {
    const d = decideApprove('AWAITING_APPROVAL', ctx());
    expect(d.ok).toBe(true);
    expect(d.next).toBe('APPROVED');
  });

  it('blocks approval when the application email is missing', () => {
    const d = decideApprove('AWAITING_APPROVAL', ctx({ hasEmail: false }));
    expect(d.ok).toBe(false);
    expect(d.code).toBe('REQUIRED_FIELDS_MISSING');
  });

  it('blocks approval when the package is missing', () => {
    const d = decideApprove('AWAITING_APPROVAL', ctx({ hasPackage: false }));
    expect(d.code).toBe('REQUIRED_FIELDS_MISSING');
  });

  it('blocks approval of an expired job', () => {
    const d = decideApprove('AWAITING_APPROVAL', ctx({ jobExpired: true }));
    expect(d.code).toBe('EXPIRED_JOB');
  });

  it('blocks approval from an illegal state', () => {
    const d = decideApprove('PREPARING', ctx());
    expect(d.ok).toBe(false);
    expect(d.code).toBe('INVALID_TRANSITION');
  });

  it('is idempotent when already approved', () => {
    const d = decideApprove('APPROVED', ctx());
    expect(d.ok).toBe(true);
    expect(d.code).toBe('ALREADY_IN_STATE');
  });
});

describe('decideReject', () => {
  it('rejects a waiting application', () => {
    expect(decideReject('AWAITING_APPROVAL')).toEqual({ ok: true, next: 'REJECTED' });
  });
  it('blocks rejection from a submitted application', () => {
    const d = decideReject('SUBMITTED');
    expect(d.ok).toBe(false);
    expect(d.code).toBe('INVALID_TRANSITION');
  });
  it('is idempotent when already rejected', () => {
    const d = decideReject('REJECTED');
    expect(d.ok).toBe(true);
    expect(d.code).toBe('ALREADY_IN_STATE');
  });
});

describe('decideWithdraw', () => {
  it('withdraws from PREPARING, AWAITING_APPROVAL and APPROVED', () => {
    for (const s of ['PREPARING', 'AWAITING_APPROVAL', 'APPROVED'] as ApplicationStatus[]) {
      expect(decideWithdraw(s)).toEqual({ ok: true, next: 'WITHDRAWN' });
    }
  });
  it('blocks withdrawal once submitted', () => {
    const d = decideWithdraw('SUBMITTED');
    expect(d.ok).toBe(false);
    expect(d.code).toBe('INVALID_TRANSITION');
  });
});

describe('decideSubmit', () => {
  it('submits an approved application', () => {
    const d = decideSubmit('APPROVED');
    expect(d.ok).toBe(true);
    expect(d.next).toBe('SUBMITTED');
  });
  it('blocks submission before approval', () => {
    const d = decideSubmit('AWAITING_APPROVAL');
    expect(d.ok).toBe(false);
    expect(d.code).toBe('INVALID_TRANSITION');
  });
  it('is idempotent when already submitted', () => {
    const d = decideSubmit('SUBMITTED');
    expect(d.ok).toBe(true);
    expect(d.code).toBe('ALREADY_IN_STATE');
  });
});
