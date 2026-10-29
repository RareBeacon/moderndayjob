import { describe, it, expect } from 'vitest';
import { hashToken, generateSessionToken, IDLE_TIMEOUT_MS, ABSOLUTE_TIMEOUT_MS } from '../lib/session';

describe('app session helpers', () => {
  it('generates opaque token and hashes deterministically', async () => {
    const token = generateSessionToken();
    expect(token.length).toBeGreaterThan(20);
    const h1 = await hashToken(token);
    const h2 = await hashToken(token);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('hash differs for different tokens', async () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(await hashToken(a)).not.toBe(await hashToken(b));
  });

  it('constants match approved policy', () => {
    expect(IDLE_TIMEOUT_MS).toBe(30 * 60 * 1000);
    expect(ABSOLUTE_TIMEOUT_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('idle vs absolute logic', () => {
    const now = Date.now();
    const created = new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString(); // 6 days ago
    const lastActive = new Date(now - 10 * 60 * 1000).toISOString(); // 10 min ago
    const expires = new Date(new Date(created).getTime() + ABSOLUTE_TIMEOUT_MS).toISOString();
    // within idle and absolute -> would be valid
    expect(now - new Date(lastActive).getTime()).toBeLessThan(IDLE_TIMEOUT_MS);
    expect(new Date(expires).getTime()).toBeGreaterThan(now);
  });
});
