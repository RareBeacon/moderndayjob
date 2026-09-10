import { describe, expect, it } from 'vitest';
import { redactSecrets, sanitizeMeta } from '@/lib/audit';

describe('redactSecrets', () => {
  it('redacts secret-shaped key=value pairs', () => {
    expect(redactSecrets('password=hunter2 token=abc.def.ghi')).toBe(
      'password=<redacted> token=<redacted>',
    );
  });

  it('redacts bearer-style tokens', () => {
    expect(redactSecrets('Authorization: Bearer xyz')).toBe('Authorization=<redacted>');
  });

  it('leaves ordinary text untouched', () => {
    const text = 'Generated a resume for the senior engineer role.';
    expect(redactSecrets(text)).toBe(text);
  });
});

describe('sanitizeMeta', () => {
  it('redacts secrets inside string values and caps length', () => {
    const out = sanitizeMeta({ note: `token=secretvalue ${'x'.repeat(600)}` });
    const note = out.note as string;
    expect(note).toContain('token=<redacted>');
    expect(note.length).toBeLessThanOrEqual(500);
  });

  it('drops undefined and null fields', () => {
    const out = sanitizeMeta({ a: undefined, b: null, c: 'keep' });
    expect(out).toEqual({ c: 'keep' });
  });

  it('deep-copies structured values', () => {
    const out = sanitizeMeta({ list: [1, 2, 3], nested: { ok: true } });
    expect(out).toEqual({ list: [1, 2, 3], nested: { ok: true } });
  });

  it('caps keys to 64 chars', () => {
    const longKey = 'k'.repeat(100);
    const out = sanitizeMeta({ [longKey]: 'v' });
    expect(Object.keys(out)[0].length).toBe(64);
  });
});
