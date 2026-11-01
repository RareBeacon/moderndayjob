import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { ResumeDocumentPreview } from '@/components/resume/ResumeDocumentPreview';
import { buildDocumentExportUrl } from '@/lib/documents/client-download';
import { parseDocumentContent, renderDocx, renderPdf } from '@/lib/documents/export';
import {
  applyDocumentModeToResume,
  normalizeResumeFromDraft,
  normalizeResumeFromStoredJson,
  resolveTemplateSectionsForMode,
} from '@/lib/resume-studio/document-model';
import { normalizeStudioDraft } from '@/lib/resume-studio/draft';
import {
  consumePendingTemplateSelection,
  requestedDocumentMode,
  requestedTemplateId,
  savePendingTemplateSelection,
  withRequestedTemplate,
} from '@/lib/resume-studio/selection';
import { CURATED_TEMPLATES, resolveTemplateSpec } from '@/lib/resume-studio/templates';

const FULL_CV_DRAFT = normalizeStudioDraft({
  versionName: 'Academic & Industry CV',
  selectedTemplate: 'executive-resume',
  documentMode: 'cv',
  personal: {
    name: 'Dr. Amara Nwosu',
    email: 'amara.nwosu@example.org',
    phone: '+234 803 555 0192',
    location: 'Port Harcourt, Nigeria',
    website: 'https://amaranwosu.org',
    linkedin: 'https://linkedin.com/in/amaranwosu',
    github: 'https://github.com/amaranwosu',
  },
  career: {
    headline: 'Principal Systems Architect & Research Fellow',
    targetRole: 'Principal Systems Architect',
    yearsExperience: '11',
    seniority: 'senior',
    summary:
      'Systems architect and applied researcher leading resilient payment and cloud infrastructure across West Africa and Europe.',
  },
  skills: [
    { name: 'Distributed Systems', category: 'Architecture', priority: 1 },
    { name: 'TypeScript', category: 'Languages', priority: 2 },
    { name: 'PostgreSQL', category: 'Cloud, Data & DevOps', priority: 3 },
  ],
  experiences: [
    {
      id: 'exp-1',
      company: 'Veridian Cloud Systems',
      role: 'Principal Systems Architect',
      location: 'Lagos',
      startDate: 'Jan 2022',
      endDate: 'Present',
      current: true,
      roughNotes: '',
      tools: ['TypeScript', 'PostgreSQL', 'Kubernetes'],
      impact: '',
      bullets: [
        'Architected multi-region settlement ledger handling 4.2M daily transactions at 99.99% uptime.',
        'Reduced p95 API latency by 43% across six partner banking integrations.',
        'Led architecture review board across 28 backend and platform engineers.',
        'Authored incident recovery playbooks cutting mean time to recovery from 42m to 9m.',
        'Directed ISO 27001 technical controls and automated audit evidence pipelines.',
        'Mentored seven senior engineers into staff and principal promotions.',
      ],
    },
  ],
  education: [
    {
      id: 'edu-1',
      institution: 'University of Lagos',
      degree: 'Ph.D.',
      field: 'Computer Science',
      startDate: '2016',
      endDate: '2020',
      achievements: 'Distinction in Fault-Tolerant Distributed Consensus',
    },
  ],
  projects: [
    {
      id: 'proj-1',
      name: 'OpenLedger Verify',
      description: 'Open-source deterministic reconciliation toolkit for regional financial switches.',
      technologies: ['Rust', 'PostgreSQL'],
      url: 'https://github.com/amaranwosu/openledger',
      achievements: ['Adopted by 14 engineering teams across three countries'],
    },
  ],
  certifications: [
    { id: 'cert-1', name: 'AWS Certified Solutions Architect - Professional', issuer: 'AWS', date: '2025' },
  ],
  publications: [
    {
      id: 'pub-1',
      title: 'Deterministic Settlement Guarantees Under Partitioned Regional Networks',
      venue: 'IEEE Transactions on Dependable Computing',
      date: '2024',
      url: 'https://doi.org/10.1000/example',
    },
  ],
  volunteer: [
    {
      id: 'vol-1',
      role: 'Technical Advisory Chair',
      organization: 'Open Source Africa',
      dates: '2021 - Present',
      summary: 'Mentors 60+ early-career systems engineers annually.',
    },
  ],
  memberships: ['ACM Senior Member', 'IEEE Computer Society', 'NSE'],
  languages: [
    { language: 'English', proficiency: 'Native' },
    { language: 'Igbo', proficiency: 'Native' },
    { language: 'French', proficiency: 'Professional Working' },
  ],
  achievements: ['2025 West Africa Cloud Engineering Excellence Award'],
  references: 'Prof. K. Adeyemi, University of Lagos (available upon formal institutional request).',
  additional: 'Cleared for international research collaborations and keynote speaking.',
});

describe('Resume vs CV (Curriculum Vitae) dual-mode architecture & flows', () => {
  it('parses URL template + docType params and carries selection across login via localStorage', () => {
    const firstId = CURATED_TEMPLATES[0]!.id;
    const academicId = CURATED_TEMPLATES.find((t) => /academic/i.test(t.name))?.id ?? CURATED_TEMPLATES[1]!.id;
    const bankingId = CURATED_TEMPLATES.find((t) => /banking|finance/i.test(t.name))?.id ?? CURATED_TEMPLATES[2]!.id;

    expect(requestedTemplateId(`?template=${firstId}&docType=cv`)).toBe(firstId);
    expect(requestedDocumentMode(`?template=${firstId}&docType=cv`)).toBe('cv');
    expect(requestedDocumentMode('?mode=resume')).toBe('resume');
    expect(requestedDocumentMode('?docType=unknown')).toBeNull();

    const baseDraft = normalizeStudioDraft({ versionName: 'General Resume' });
    const upgraded = withRequestedTemplate(baseDraft, academicId, 'cv');
    expect(upgraded.selectedTemplate).toBe(academicId);
    expect(upgraded.documentMode).toBe('cv');
    expect(upgraded.versionName).toBe('General CV');

    const switchedBack = withRequestedTemplate(upgraded, firstId, 'resume');
    expect(switchedBack.documentMode).toBe('resume');
    expect(switchedBack.versionName).toBe('General Resume');

    // Simulate browser localStorage carry-over across /templates -> /login -> /generate
    const store = new Map<string, string>();
    const origWindow = globalThis.window;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: (k: string) => store.get(k) ?? null,
          setItem: (k: string, v: string) => {
            store.set(k, v);
          },
          removeItem: (k: string) => {
            store.delete(k);
          },
        },
      },
    });
    try {
      savePendingTemplateSelection(bankingId, 'cv');
      const consumed = consumePendingTemplateSelection();
      expect(consumed).toEqual({ templateId: bankingId, documentMode: 'cv' });
      // Consumed once so subsequent visits do not unexpectedly override
      expect(consumePendingTemplateSelection()).toBeNull();
    } finally {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: origWindow });
    }
  });

  it('includes all comprehensive CV sections across every 1-col and 2-col template in CV mode', () => {
    for (const tpl of CURATED_TEMPLATES) {
      const spec = resolveTemplateSpec(tpl);
      const cvSections = resolveTemplateSectionsForMode(spec, 'cv');
      const combined = [...cvSections.primarySections, ...cvSections.secondarySections];

      expect(combined).toContain('summary');
      expect(combined).toContain('experience');
      expect(combined).toContain('education');
      expect(combined).toContain('publications');
      expect(combined).toContain('projects');
      expect(combined).toContain('certifications');
      expect(combined).toContain('skills');
      expect(combined).toContain('awards');
      expect(combined).toContain('memberships');
      expect(combined).toContain('volunteer');
      expect(combined).toContain('languages');
      expect(combined).toContain('references');

      // Resume mode preserves curated template section priority without mutation
      const resumeSections = resolveTemplateSectionsForMode(spec, 'resume');
      expect(resumeSections.primarySections).toEqual(spec.blueprint.primarySections);
      expect(resumeSections.secondarySections).toEqual(spec.blueprint.secondarySections);
    }
  });

  it('renders live HTML preview + valid ISO A4 PDF & DOCX for all 30 templates in both Resume and CV modes', async () => {
    const storedJson = JSON.stringify({
      templateId: 'executive-resume',
      templateName: 'Executive Resume',
      documentMode: 'cv',
      contact: FULL_CV_DRAFT.personal,
      headline: FULL_CV_DRAFT.career.headline,
      summary: FULL_CV_DRAFT.career.summary,
      skills: FULL_CV_DRAFT.skills.map((s) => s.name),
      skillItems: FULL_CV_DRAFT.skills,
      experiences: FULL_CV_DRAFT.experiences.map((e) => ({
        company: e.company,
        title: e.role,
        location: e.location,
        start: e.startDate,
        end: 'Present',
        bullets: e.bullets,
        tools: e.tools,
      })),
      education: FULL_CV_DRAFT.education.map((e) => ({
        institution: e.institution,
        degree: e.degree,
        field: e.field,
        qualification: `${e.degree}, ${e.field}`,
        start: e.startDate,
        end: e.endDate,
        achievements: e.achievements,
      })),
      projects: FULL_CV_DRAFT.projects,
      certifications: FULL_CV_DRAFT.certifications,
      publications: FULL_CV_DRAFT.publications,
      volunteer: FULL_CV_DRAFT.volunteer,
      memberships: FULL_CV_DRAFT.memberships,
      languages: FULL_CV_DRAFT.languages,
      achievements: FULL_CV_DRAFT.achievements,
      references: FULL_CV_DRAFT.references,
      additional: FULL_CV_DRAFT.additional,
    });

    const parsedCv = parseDocumentContent('CV', storedJson, 'Dr. Amara Nwosu CV', 'cv');
    const parsedResume = parseDocumentContent('CV', storedJson, 'Dr. Amara Nwosu Resume', 'resume');

    expect(parsedCv.documentMode).toBe('cv');
    expect(parsedResume.documentMode).toBe('resume');
    expect(parsedCv.resume?.experiences[0]?.bullets.length).toBe(6);
    expect(parsedResume.resume?.experiences[0]?.bullets.length).toBe(5);
    expect(parsedCv.resume?.skillGroups.some((g) => g.category === 'Architecture')).toBe(true);

    for (const tpl of CURATED_TEMPLATES) {
      // Live HTML preview in CV mode includes publications & references even on corporate/tech templates
      const htmlCv = renderToStaticMarkup(
        React.createElement(ResumeDocumentPreview, {
          draft: { ...FULL_CV_DRAFT, selectedTemplate: tpl.id, documentMode: 'cv' },
          template: tpl,
          size: 'full',
        }),
      );
      expect(htmlCv).toContain('Deterministic Settlement Guarantees');
      expect(htmlCv).toContain('Open Source Africa');
      expect(htmlCv).toContain('ACM Senior Member');

      // Exported A4 PDF in both CV and Resume modes
      const cvPdfBuf = await renderPdf(parsedCv.title, parsedCv.sections, null, tpl.id, parsedCv.resume);
      const cvPdf = await PDFDocument.load(cvPdfBuf);
      expect(cvPdf.getPageCount()).toBeGreaterThanOrEqual(1);
      const { width, height } = cvPdf.getPage(0).getSize();
      expect(Math.round(width)).toBe(595);
      expect(Math.round(height)).toBe(842);

      const resPdfBuf = await renderPdf(parsedResume.title, parsedResume.sections, null, tpl.id, parsedResume.resume);
      const resPdf = await PDFDocument.load(resPdfBuf);
      expect(resPdf.getPageCount()).toBeGreaterThanOrEqual(1);

      // Exported A4 DOCX in CV mode
      const cvDocxBuf = await renderDocx(parsedCv.title, parsedCv.sections, null, tpl.id, parsedCv.resume);
      expect(cvDocxBuf.subarray(0, 2).toString('ascii')).toBe('PK');
      expect(cvDocxBuf.byteLength).toBeGreaterThan(2000);
    }
  }, 45000);

  it('builds clean export URLs with format, template, and docType parameters', () => {
    expect(
      buildDocumentExportUrl({
        documentId: 'doc-123',
        format: 'pdf',
        templateId: 'executive-resume',
        documentMode: 'cv',
      }),
    ).toBe('/api/documents/doc-123/export?format=pdf&template=executive-resume&docType=cv');

    expect(
      buildDocumentExportUrl({
        documentId: 'doc-123',
        format: 'docx',
        templateId: 'software-engineer-resume',
        documentMode: 'resume',
      }),
    ).toBe('/api/documents/doc-123/export?format=docx&template=software-engineer-resume&docType=resume');

    const norm = normalizeResumeFromDraft(FULL_CV_DRAFT);
    expect(applyDocumentModeToResume(norm, 'resume').documentMode).toBe('resume');
    expect(applyDocumentModeToResume(norm, 'cv').documentMode).toBe('cv');

    const fromStored = normalizeResumeFromStoredJson({
      documentMode: 'cv',
      contact: { name: 'Test Candidate' },
      skillItems: [{ name: 'Kubernetes', category: 'Platform Engineering' }],
    });
    expect(fromStored.documentMode).toBe('cv');
    expect(fromStored.skillGroups[0]).toEqual({
      category: 'Platform Engineering',
      items: ['Kubernetes'],
    });
  });
});
