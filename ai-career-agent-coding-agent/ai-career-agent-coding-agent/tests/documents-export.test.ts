import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { RESUME_TEMPLATES } from '@/lib/resume-studio/templates';
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


describe('selected-template export propagation', () => {
  it('rejects unknown template IDs while retaining known CV selections', () => {
    const original = JSON.parse(cv);
    const known = parseDocumentContent('CV', JSON.stringify({ ...original, templateId: 'modern-tech' }));
    const unknown = parseDocumentContent('CV', JSON.stringify({ ...original, templateId: '__untrusted__' }));
    expect(known.templateId).toBe('modern-tech');
    expect(unknown.templateId).toBeUndefined();
  });

  it('exports all 70 saved designs to styled PDF and DOCX without sample data', async () => {
    const raw = JSON.parse(cv);
    const usedIds: string[] = [];
    for (const template of RESUME_TEMPLATES) {
      const parsed = parseDocumentContent('CV', JSON.stringify({ ...raw, templateId: template.id, contact: { name: 'Real User', email: 'real@example.com' } }));
      expect(parsed.templateId, template.id).toBe(template.id);
      const pdf = await renderPdf(parsed.title, parsed.sections, parsed.photo, parsed.templateId);
      const docx = await renderDocx(parsed.title, parsed.sections, parsed.photo, parsed.templateId);
      expect(pdf.subarray(0, 4).toString(), template.id).toBe('%PDF');
      expect((await PDFDocument.load(new Uint8Array(pdf))).getPageCount(), template.id).toBeGreaterThan(0);
      expect(docx.subarray(0, 2).toString(), template.id).toBe('PK');
      const xml = await (await JSZip.loadAsync(docx)).file('word/document.xml')?.async('string');
      expect(xml, template.id).toContain('Real User');
      expect(xml, template.id).toContain(template.accent.slice(1).toUpperCase());
      expect(xml, template.id).not.toContain('Northstar Labs');
      const twoColumn = template.columns === 2 || ['two-column', 'sidebar', 'modular-grid'].includes(template.layout);
      expect(xml?.includes('<w:tbl>'), template.id).toBe(twoColumn);
      usedIds.push(template.id);
    }
    expect(usedIds).toHaveLength(70);
  });
});
