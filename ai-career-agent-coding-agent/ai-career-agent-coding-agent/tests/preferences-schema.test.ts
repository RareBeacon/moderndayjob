import { describe, it, expect } from 'vitest';
import { preferencesSchema } from '../lib/schemas/preferences';

describe('preferencesSchema', () => {
  it('applies sensible defaults for an empty payload', () => {
    const out = preferencesSchema.parse({});
    expect(out.application_mode).toBe('approval');
    expect(out.daily_target).toBe(10);
    expect(out.currency).toBe('NGN');
    expect(out.salary_min).toBeNull();
    expect(out.remote_types).toEqual([]);
  });

  it('accepts a full preferences object', () => {
    const out = preferencesSchema.parse({
      remote_types: ['remote'],
      locations: ['Lagos, Nigeria'],
      employment_types: ['full-time'],
      salary_min: 250000,
      application_mode: 'auto',
      daily_target: 20,
    });
    expect(out.remote_types).toEqual(['remote']);
    expect(out.application_mode).toBe('auto');
    expect(out.salary_min).toBe(250000);
  });

  it('rejects an invalid application mode', () => {
    expect(() => preferencesSchema.parse({ application_mode: 'turbo' })).toThrow();
  });

  it('rejects out-of-range daily targets', () => {
    expect(() => preferencesSchema.parse({ daily_target: 0 })).toThrow();
    expect(() => preferencesSchema.parse({ daily_target: 999 })).toThrow();
  });
});
