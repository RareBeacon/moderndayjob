import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Application lifecycle route handlers (Phase 9). The routes are thin: they
 * authenticate, rate-limit, parse the body, call the owner-scoped service,
 * and map AppActionError codes to honest HTTP statuses. These tests pin that
 * mapping and that the service is always called with the SERVER-derived user
 * id, never client input.
 */

const m = vi.hoisted(() => {
  class FakeAppActionError extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  }
  return {
    FakeAppActionError,
    requireUser: vi.fn(),
    enforceRateLimit: vi.fn(),
    requestIp: vi.fn(() => '1.2.3.4'),
    prepareApplication: vi.fn(),
    approveApplication: vi.fn(),
    rejectApplication: vi.fn(),
    withdrawApplication: vi.fn(),
    submitApplication: vi.fn(),
    requestAutoSubmit: vi.fn(),
  };
});

vi.mock('@/lib/auth', () => ({ requireUser: m.requireUser, getUser: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: m.enforceRateLimit, requestIp: m.requestIp }));
vi.mock('@/lib/applications/service', () => ({
  AppActionError: m.FakeAppActionError,
  prepareApplication: m.prepareApplication,
  approveApplication: m.approveApplication,
  rejectApplication: m.rejectApplication,
  withdrawApplication: m.withdrawApplication,
  submitApplication: m.submitApplication,
  requestAutoSubmit: m.requestAutoSubmit,
}));

import { POST as approvePost } from '@/app/api/applications/[id]/approve/route';
import { POST as rejectPost } from '@/app/api/applications/[id]/reject/route';
import { POST as withdrawPost } from '@/app/api/applications/[id]/withdraw/route';
import { POST as submitPost } from '@/app/api/applications/[id]/submit/route';
import { POST as autoSubmitPost } from '@/app/api/applications/[id]/auto-submit/route';
import { POST as preparePost } from '@/app/api/applications/prepare/route';

const detail = { application: { id: 'app-1', status: 'APPROVED' } };

function req(body?: unknown) {
  return new Request('http://x/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: 'app-1' }) };
const err = (code: string) => new m.FakeAppActionError(code, code);

beforeEach(() => {
  vi.clearAllMocks();
  m.requireUser.mockResolvedValue({ id: 'user-1', email: 'a@b.co' });
  m.enforceRateLimit.mockResolvedValue({ allowed: true, remaining: 19 });
  m.prepareApplication.mockResolvedValue(detail);
  m.approveApplication.mockResolvedValue(detail);
  m.rejectApplication.mockResolvedValue(detail);
  m.withdrawApplication.mockResolvedValue(detail);
  m.submitApplication.mockResolvedValue(detail);
  m.requestAutoSubmit.mockResolvedValue({ taskId: 'task-1' });
});

describe('POST /api/applications/prepare', () => {
  it('creates (or reuses) an application and returns 201', async () => {
    const res = await preparePost(req({ jobId: '11111111-1111-4111-8111-111111111111' }));
    expect(res.status).toBe(201);
    expect(m.prepareApplication).toHaveBeenCalledWith('user-1', '11111111-1111-4111-8111-111111111111', 'a@b.co');
  });

  it('rejects a malformed jobId with 400 before calling the service', async () => {
    const res = await preparePost(req({ jobId: 'not-a-uuid' }));
    expect(res.status).toBe(400);
    expect(m.prepareApplication).not.toHaveBeenCalled();
  });

  it('maps an expired job to 409', async () => {
    m.prepareApplication.mockRejectedValue(err('EXPIRED_JOB'));
    const res = await preparePost(req({ jobId: '11111111-1111-4111-8111-111111111111' }));
    expect(res.status).toBe(409);
  });

  it('returns 429 when rate limited', async () => {
    m.enforceRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    const res = await preparePost(req({ jobId: '11111111-1111-4111-8111-111111111111' }));
    expect(res.status).toBe(429);
    expect(m.prepareApplication).not.toHaveBeenCalled();
  });
});

describe('POST /api/applications/[id]/approve', () => {
  it('approves with the server-derived user id', async () => {
    const res = await approvePost(req(), params);
    expect(res.status).toBe(200);
    expect(m.approveApplication).toHaveBeenCalledWith('user-1', 'app-1');
  });

  it('maps NOT_FOUND → 404 and REQUIRED_FIELDS_MISSING → 422', async () => {
    m.approveApplication.mockRejectedValue(err('NOT_FOUND'));
    expect((await approvePost(req(), params)).status).toBe(404);
    m.approveApplication.mockRejectedValue(err('REQUIRED_FIELDS_MISSING'));
    expect((await approvePost(req(), params)).status).toBe(422);
  });
});

describe('POST /api/applications/[id]/reject', () => {
  it('passes the (optional) reason through', async () => {
    const res = await rejectPost(req({ reason: 'not a fit' }), params);
    expect(res.status).toBe(200);
    expect(m.rejectApplication).toHaveBeenCalledWith('user-1', 'app-1', 'not a fit');
  });

  it('drops an invalid reason and still rejects', async () => {
    await rejectPost(req({ reason: 12345 }), params);
    expect(m.rejectApplication).toHaveBeenCalledWith('user-1', 'app-1', undefined);
  });
});

describe('POST /api/applications/[id]/withdraw and /submit', () => {
  it('withdraws with the server-derived user id', async () => {
    const res = await withdrawPost(req(), params);
    expect(res.status).toBe(200);
    expect(m.withdrawApplication).toHaveBeenCalledWith('user-1', 'app-1');
  });

  it('maps an invalid transition to 409', async () => {
    m.withdrawApplication.mockRejectedValue(err('INVALID_TRANSITION'));
    expect((await withdrawPost(req(), params)).status).toBe(409);
  });

  it('submits (assisted handoff) with the server-derived user id', async () => {
    const res = await submitPost(req(), params);
    expect(res.status).toBe(200);
    expect(m.submitApplication).toHaveBeenCalledWith('user-1', 'app-1');
  });
});

describe('POST /api/applications/[id]/auto-submit', () => {
  it('enqueues and returns 202 with the task id', async () => {
    const res = await autoSubmitPost(req(), params);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ taskId: 'task-1', status: 'QUEUED' });
    expect(m.requestAutoSubmit).toHaveBeenCalledWith('user-1', 'app-1');
  });

  it('maps NOT_ENTITLED → 403', async () => {
    m.requestAutoSubmit.mockRejectedValue(err('NOT_ENTITLED'));
    expect((await autoSubmitPost(req(), params)).status).toBe(403);
  });

  it('maps AUTOMATION_DISABLED and UNSUPPORTED_PLATFORM → 409, NOT_FOUND → 404', async () => {
    m.requestAutoSubmit.mockRejectedValue(err('AUTOMATION_DISABLED'));
    expect((await autoSubmitPost(req(), params)).status).toBe(409);
    m.requestAutoSubmit.mockRejectedValue(err('UNSUPPORTED_PLATFORM'));
    expect((await autoSubmitPost(req(), params)).status).toBe(409);
    m.requestAutoSubmit.mockRejectedValue(err('NOT_FOUND'));
    expect((await autoSubmitPost(req(), params)).status).toBe(404);
  });
});
