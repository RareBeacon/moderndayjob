import { describe, expect, it } from 'vitest';
import { hasDash, stripDashes, stripPlaceholders } from '@/lib/ai/sanitize';

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

describe('stripPlaceholders (missing-fact tokens)', () => {
  it('removes trailing placeholder phrases with their dangling separator', () => {
    expect(stripPlaceholders('AI Engineer \u00b7 N/A')).toBe('AI Engineer');
    expect(stripPlaceholders('AI Engineer - Unknown')).toBe('AI Engineer');
    expect(stripPlaceholders('Lagos | TBD')).toBe('Lagos');
  });
  it('removes leading placeholders and bare N/A tokens', () => {
    expect(stripPlaceholders('N/A \u00b7 AI Engineer')).toBe('AI Engineer');
    expect(stripPlaceholders('Company: N/A')).toBe('Company: ');
    expect(stripPlaceholders('{"company": "N/A", "title": "AI Engineer"}')).toBe(
      '{"company": "", "title": "AI Engineer"}',
    );
  });
  it('leaves real prose and URLs untouched', () => {
    expect(stripPlaceholders('Worked with unknown technologies daily.')).toBe(
      'Worked with unknown technologies daily.',
    );
    expect(stripPlaceholders('See https://example.com/n/a for details')).toBe(
      'See https://example.com/n/a for details',
    );
    expect(stripPlaceholders('')).toBe('');
  });
});
