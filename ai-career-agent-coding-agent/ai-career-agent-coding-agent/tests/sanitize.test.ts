import { describe, expect, it } from 'vitest';
import { hasDash, stripDashes } from '@/lib/ai/sanitize';

describe('stripDashes (em/en dash rule)', () => {
  it('replaces em dashes, en dashes and horizontal bars with hyphens', () => {
    expect(stripDashes('Led the team \u2014 shipped \u2013 on time \u2015 all good')).toBe(
      'Led the team - shipped - on time - all good',
    );
  });

  it('leaves hyphens, commas, colons and parentheses untouched', () => {
    const input = 'Senior engineer (8 yrs): led, built, and shipped - on time.';
    expect(stripDashes(input)).toBe(input);
  });

  it('returns empty input unchanged', () => {
    expect(stripDashes('')).toBe('');
  });

  it('detects dash variants but not plain hyphens', () => {
    expect(hasDash('x\u2014y')).toBe(true);
    expect(hasDash('x\u2013y')).toBe(true);
    expect(hasDash('x-y')).toBe(false);
  });
});
