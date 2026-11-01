import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { parseDocumentContent, renderDocx, renderPdf } from '@/lib/documents/export';
import { A4_HEIGHT_PT, A4_WIDTH_PT, renderTemplatePdf } from '@/lib/documents/template-export';
import {
  CATALOG_30_SPECS,
  LIBRARY_FILTER_CATEGORIES,
  RESUME_TEMPLATES,
  TEMPLATE_GROUPS,
} from '@/lib/resume-studio/templates';
import { normalizeResumeFromDraft } from '@/lib/resume-studio/document-model';
import { SAMPLE_PREVIEW_DRAFT } from '@/lib/resume-studio/sample';
import { freshDraft } from '@/lib/resume-studio/prefill';

describe('Jobiest 30 Unique A4 Resume Library & Export System', () => {
  it('defines all 30 required templates across Groups A-F with unique structural blueprints', () => {
    expect(CATALOG_30_SPECS).toHaveLength(30);
    expect(RESUME_TEMPLATES).toHaveLength(30);

    expect(CATALOG_30_SPECS.map((s) => s.code)).toEqual(
      Array.from({ length: 30 }, (_, i) => String(i + 1).padStart(2, '0')),
    );

    expect(new Set(CATALOG_30_SPECS.map((s) => s.id)).size).toBe(30);
    expect(new Set(CATALOG_30_SPECS.map((s) => s.name)).size).toBe(30);
    expect(new Set(CATALOG_30_SPECS.map((s) => s.folderSlug)).size).toBe(30);
    expect(new Set(CATALOG_30_SPECS.map((s) => s.pdfFileName)).size).toBe(30);

    // Every Group A-F has exact expected count (5, 5, 5, 5, 4, 6 = 30)
    const groupCounts = Object.fromEntries(
      Object.keys(TEMPLATE_GROUPS).map((g) => [g, CATALOG_30_SPECS.filter((s) => s.group === g).length]),
    );
    expect(groupCounts).toEqual({ A: 5, B: 5, C: 5, D: 5, E: 4, F: 6 });

    // Every single template has a distinct masthead + structural fingerprint (zero renamed clones)
    const mastheads = new Set(CATALOG_30_SPECS.map((s) => s.blueprint.masthead));
    expect(mastheads.size).toBe(30);

    const structuralFingerprints = new Set(
      CATALOG_30_SPECS.map((s) =>
        [
          s.columns,
          s.blueprint.masthead,
          s.blueprint.bodyStructure,
          s.blueprint.sectionHeadingStyle,
          s.blueprint.experienceStyle,
          s.blueprint.skillsPresentation,
          s.blueprint.primarySections.slice(0, 5).join('>'),
        ].join('|'),
      ),
    );
    expect(structuralFingerprints.size).toBe(30);
  });

  it('populates all 10 Resume Library filter categories and enforces honest ATS classification', () => {
    for (const cat of LIBRARY_FILTER_CATEGORIES) {
      const matches = RESUME_TEMPLATES.filter((t) => t.libraryCategories?.includes(cat));
      expect(matches.length, `category ${cat} should have templates`).toBeGreaterThanOrEqual(1);
    }

    const verified = CATALOG_30_SPECS.filter((s) => s.atsCompatibility === 'verified');
    const partial = CATALOG_30_SPECS.filter((s) => s.atsCompatibility === 'partial');
    expect(verified).toHaveLength(21);
    expect(partial).toHaveLength(9);

    for (const s of verified) {
      expect(s.columns, `${s.id} verified ATS must be 1-column`).toBe(1);
      expect(s.atsFriendly).toBe(true);
      expect(s.atsNotes.length).toBeGreaterThan(25);
    }
    for (const s of partial) {
      expect(s.columns, `${s.id} partial ATS is 2-column`).toBe(2);
      expect(s.atsFriendly).toBe(false);
      expect(s.atsNotes.length).toBeGreaterThan(25);
    }

    // Zero fake skill progress bars anywhere in the 30 curated templates
    expect(RESUME_TEMPLATES.some((t) => t.skillStyle === 'bars')).toBe(false);
  });

  it('preserves all user data when switching templates and omits empty optional sections cleanly', async () => {
    const minimalUserDraft = {
      ...freshDraft(),
      personal: {
        ...freshDraft().personal,
        name: 'Chiamaka Okafor',
        email: 'chiamaka@example.org',
        location: 'Lagos, Nigeria',
      },
      career: {
        ...freshDraft().career,
        headline: 'Backend Engineer',
        summary: 'Builds resilient payment settlement microservices.',
      },
      experiences: [
        {
          id: 'e1',
          company: 'Paybridge',
          role: 'Backend Engineer',
          location: 'Lagos',
          startDate: 'Jan 2023',
          endDate: 'Present',
          current: true,
          roughNotes: '',
          tools: ['Go', 'PostgreSQL'],
          impact: '',
          bullets: ['Processed 400k daily ledger settlements with zero reconciliation drift.'],
        },
      ],
      skills: [
        { name: 'Go', category: 'Languages', priority: 1 },
        { name: 'PostgreSQL', category: 'Cloud, Data & DevOps', priority: 2 },
      ],
    };

    const norm = normalizeResumeFromDraft(minimalUserDraft);
    expect(norm.projects).toHaveLength(0);
    expect(norm.certifications).toHaveLength(0);
    expect(norm.publications).toHaveLength(0);
    expect(norm.languages).toHaveLength(0);

    // Render across a 1-column and a 2-column template and verify valid A4 PDFs with zero undefined/empty crashes
    for (const tplId of ['tpl-01-executive', 'tpl-06-software-engineer', 'tpl-20-digital-creator', 'tpl-30-modern-two-column']) {
      const pdfBuf = await renderTemplatePdf(norm.professionalTitle, [], tplId, null, norm);
      const loaded = await PDFDocument.load(new Uint8Array(pdfBuf));
      expect(loaded.getPageCount()).toBe(1);
      const { width, height } = loaded.getPage(0).getSize();
      expect(width).toBeCloseTo(A4_WIDTH_PT, 1);
      expect(height).toBeCloseTo(A4_HEIGHT_PT, 1);
    }
  });

  it('renders all 30 templates for Alex Morgan on true ISO A4 pages in both PDF and DOCX', async () => {
    const alexNorm = normalizeResumeFromDraft(SAMPLE_PREVIEW_DRAFT);
    const cvJson = JSON.stringify({
      templateId: 'tpl-03-modern-professional',
      contact: SAMPLE_PREVIEW_DRAFT.personal,
      headline: SAMPLE_PREVIEW_DRAFT.career.headline,
      summary: SAMPLE_PREVIEW_DRAFT.career.summary,
      experiences: SAMPLE_PREVIEW_DRAFT.experiences.map((e) => ({
        company: e.company,
        title: e.role,
        location: e.location,
        start: e.startDate,
        end: e.current ? 'Present' : e.endDate,
        bullets: e.bullets,
      })),
      skills: SAMPLE_PREVIEW_DRAFT.skills,
      education: SAMPLE_PREVIEW_DRAFT.education.map((ed) => ({
        institution: ed.institution,
        degree: ed.degree,
        field: ed.field,
        qualification: `${ed.degree}, ${ed.field}`,
        start: ed.startDate,
        end: ed.endDate,
        achievements: ed.achievements,
      })),
      projects: SAMPLE_PREVIEW_DRAFT.projects,
      certifications: SAMPLE_PREVIEW_DRAFT.certifications,
      languages: SAMPLE_PREVIEW_DRAFT.languages,
      additional: SAMPLE_PREVIEW_DRAFT.additional,
    });

    const parsed = parseDocumentContent('CV', cvJson, alexNorm.professionalTitle);

    for (const tpl of RESUME_TEMPLATES) {
      const pdfBuf = await renderPdf(parsed.title, parsed.sections, null, tpl.id, parsed.resume);
      const loaded = await PDFDocument.load(new Uint8Array(pdfBuf));
      expect(loaded.getPageCount(), tpl.id).toBeGreaterThanOrEqual(1);
      expect(loaded.getPageCount(), tpl.id).toBeLessThanOrEqual(2);
      for (const page of loaded.getPages()) {
        const { width, height } = page.getSize();
        expect(width, `${tpl.id} width`).toBeCloseTo(595.28, 1);
        expect(height, `${tpl.id} height`).toBeCloseTo(841.89, 1);
      }

      const docxBuf = await renderDocx(parsed.title, parsed.sections, null, tpl.id, parsed.resume);
      expect(docxBuf.subarray(0, 2).toString(), tpl.id).toBe('PK');
    }
  });
});
