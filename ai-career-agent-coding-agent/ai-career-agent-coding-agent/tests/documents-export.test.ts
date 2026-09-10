import { describe, expect, it } from 'vitest';
import { parseDocumentContent, renderDocx, renderPdf } from '@/lib/documents/export';

const cv = JSON.stringify({
  headline: 'Senior Full-Stack Engineer',
  summary: 'Engineer with 8 years in fintech.',
  experiences: [
    { company: 'Paystack', title: 'Senior Engineer', start: '2021', end: '2024', bullets: ['Cut API p95 latency by 40 percent.'] },
  ],
  skills: ['TypeScript', 'React', 'Node.js'],
  education: [{ institution: 'University of Lagos', qualification: 'BSc Computer Science' }],
});

describe('parseDocumentContent', () => {
  it('parses structured CV JSON', () => {
    const p = parseDocumentContent('CV', cv);
    expect(p.title).toContain('Senior Full-Stack Engineer');
    expect(p.sections.some((s) => s.heading === 'Experience')).toBe(true);
    expect(p.sections.some((s) => s.heading === 'Skills')).toBe(true);
  });

  it('parses cover-letter body', () => {
    const p = parseDocumentContent('COVER_LETTER', 'Dear team,\n\nI am writing to apply.\n\nBest, Chidi');
    expect(p.sections.length).toBeGreaterThanOrEqual(2);
  });

  it('parses answers JSON', () => {
    const p = parseDocumentContent('ANSWERS', JSON.stringify({ answers: [{ question: 'Why us?', answer: 'Because.' }] }));
    expect(p.sections[0].lines.join(' ')).toContain('Why us?');
  });

  it('falls back to plain text', () => {
    const p = parseDocumentContent('CV', '# Header\n- bullet one\n- bullet two');
    expect(p.sections[0].heading).toBe('Header');
    expect(p.sections[0].lines).toEqual(['bullet one', 'bullet two']);
  });
});

describe('renderPdf / renderDocx', () => {
  it('produces a valid PDF buffer', async () => {
    const p = parseDocumentContent('CV', cv);
    const buf = await renderPdf(p.title, p.sections);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('produces a valid DOCX (zip) buffer', async () => {
    const p = parseDocumentContent('CV', cv);
    const buf = await renderDocx(p.title, p.sections);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 2).toString()).toBe('PK'); // zip magic
  });
});
