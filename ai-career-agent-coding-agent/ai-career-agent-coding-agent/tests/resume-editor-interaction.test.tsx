import { describe, expect, it } from 'vitest';
import {
  cleanText,
  normalizeStudioDraft,
  scoreResumeDraft,
  stripResumeUnsafePunctuation,
  EMPTY_STUDIO_DRAFT,
  type StudioDraft,
} from '@/lib/resume-studio/draft';
import { normalizeResumeFromDraft } from '@/lib/resume-studio/document-model';

describe('Resume Editor typing, interaction & persistence contracts', () => {
  it('preserves trailing spaces while typing into controlled fields', () => {
    const rawName = 'Opeyemi ';
    expect(cleanText(rawName)).toBe('Opeyemi ');

    const draft = normalizeStudioDraft({
      personal: { ...EMPTY_STUDIO_DRAFT.personal, name: rawName, location: 'Lagos ' },
      career: { ...EMPTY_STUDIO_DRAFT.career, targetRole: 'Lead Engineer ' },
    });

    expect(draft.personal.name).toBe('Opeyemi ');
    expect(draft.personal.location).toBe('Lagos ');
    expect(draft.career.targetRole).toBe('Lead Engineer ');
  });

  it('preserves newlines in multi-line textareas without collapsing them into spaces', () => {
    const multiLineNotes = 'Line one notes.\nLine two results.\nLine three metrics.';
    expect(cleanText(multiLineNotes)).toBe(multiLineNotes);

    const draft = normalizeStudioDraft({
      career: { ...EMPTY_STUDIO_DRAFT.career, summary: multiLineNotes },
      experiences: [
        {
          id: 'exp-1',
          company: 'Acme Corp',
          role: 'AI Engineer',
          roughNotes: multiLineNotes,
          tools: ['Python', 'TypeScript'],
          impact: 'High impact',
          bullets: ['Bullet 1', 'Bullet 2'],
        },
      ],
    });

    expect(draft.career.summary).toBe(multiLineNotes);
    expect(draft.experiences[0].roughNotes).toBe(multiLineNotes);
  });

  it('does not drop newly added empty experience entries so users can type into them', () => {
    const initialDraft = normalizeStudioDraft({
      experiences: [
        {
          id: 'exp-empty-1',
          company: '',
          role: '',
          roughNotes: '',
          tools: [],
          impact: '',
          bullets: [],
        },
      ],
    });

    expect(initialDraft.experiences).toHaveLength(1);
    expect(initialDraft.experiences[0].id).toBe('exp-empty-1');
  });

  it('does not drop newly added empty education or project entries', () => {
    const initialDraft = normalizeStudioDraft({
      education: [
        {
          id: 'edu-empty-1',
          institution: '',
          degree: '',
          field: '',
        },
      ],
      projects: [
        {
          id: 'proj-empty-1',
          name: '',
          description: '',
          technologies: [],
          achievements: [],
        },
      ],
    });

    expect(initialDraft.education).toHaveLength(1);
    expect(initialDraft.education[0].id).toBe('edu-empty-1');
    expect(initialDraft.projects).toHaveLength(1);
    expect(initialDraft.projects[0].id).toBe('proj-empty-1');
  });

  it('replaces disallowed em-dash and en-dash characters with standard hyphens', () => {
    const inputWithEmDash = 'Lead Developer \u2014 Frontend \u2013 Backend';
    expect(stripResumeUnsafePunctuation(inputWithEmDash)).toBe('Lead Developer - Frontend - Backend');
  });

  it('serializes and deserializes cleanly without data loss or corruption', () => {
    const original: StudioDraft = normalizeStudioDraft({
      versionName: 'Full Stack Draft',
      selectedTemplate: 'tpl-01-executive',
      documentMode: 'cv',
      personal: {
        name: 'Alex Morgan',
        email: 'alex@example.com',
        phone: '+234 801 234 5678',
        location: 'Abuja, Nigeria',
        website: 'https://alex.dev',
        linkedin: 'https://linkedin.com/in/alex',
        github: 'https://github.com/alex',
      },
      career: {
        headline: 'Staff Software Engineer',
        targetRole: 'VP of Engineering',
        yearsExperience: '10',
        seniority: 'executive',
        summary: 'Experienced engineering leader driving high-growth fintech platforms and reliable distributed systems.',
      },
      skills: [
        { name: 'System Architecture', category: 'Leadership', priority: 1 },
        { name: 'Distributed Systems', category: 'Engineering', priority: 2 },
        { name: 'Fintech Payments', category: 'Domain', priority: 3 },
        { name: 'Go / Golang', category: 'Backend', priority: 4 },
        { name: 'PostgreSQL', category: 'Database', priority: 5 },
        { name: 'Kafka', category: 'Streaming', priority: 6 },
      ],
      experiences: [
        {
          id: 'exp-101',
          company: 'PayFlow Global',
          role: 'Director of Engineering',
          location: 'Lagos / Remote',
          startDate: '2021',
          endDate: 'Present',
          current: true,
          roughNotes: 'Led team of 40 engineers across payments and settlements.',
          tools: ['Go', 'PostgreSQL', 'Kafka'],
          impact: 'Scaled transaction volume by 12x with 99.99% uptime.',
          bullets: ['Scaled transaction processing pipeline', 'Mentored 8 engineering managers'],
        },
      ],
      education: [
        {
          id: 'edu-201',
          institution: 'University of Lagos',
          degree: 'B.Sc.',
          field: 'Computer Engineering',
          startDate: '2010',
          endDate: '2015',
          achievements: 'First Class Honors',
        },
      ],
      projects: [
        {
          id: 'proj-301',
          name: 'Distributed Ledger Engine',
          description: 'High-throughput reconciliation engine.',
          technologies: ['Rust', 'gRPC'],
          achievements: ['Processes 50k events per second'],
        },
      ],
      certifications: [{ id: 'cert-1', name: 'AWS Solutions Architect Professional', issuer: 'Amazon', date: '2023' }],
      achievements: ['40 under 40 Fintech Innovator 2024'],
      references: 'Available upon request',
      additional: 'Open to selective advisory roles',
      targetJobDescription: 'Seeking visionary VP of Engineering...',
    });

    const json = JSON.stringify(original);
    const restored = normalizeStudioDraft(JSON.parse(json));

    expect(restored.versionName).toBe(original.versionName);
    expect(restored.personal).toEqual(original.personal);
    expect(restored.career).toEqual(original.career);
    expect(restored.experiences).toHaveLength(1);
    expect(restored.experiences[0].company).toBe('PayFlow Global');
    expect(restored.education).toHaveLength(1);
    expect(restored.projects).toHaveLength(1);
    expect(restored.certifications).toHaveLength(1);

    // Verify document model ignores empty draft stubs for exports but retains filled records
    const normalizedDoc = normalizeResumeFromDraft(restored);
    expect(normalizedDoc.fullName).toBe('Alex Morgan');
    expect(normalizedDoc.experiences).toHaveLength(1);
    expect(normalizedDoc.education).toHaveLength(1);
    expect(normalizedDoc.projects).toHaveLength(1);

    const score = scoreResumeDraft(restored);
    expect(score.total).toBeGreaterThanOrEqual(80);
  });
});
