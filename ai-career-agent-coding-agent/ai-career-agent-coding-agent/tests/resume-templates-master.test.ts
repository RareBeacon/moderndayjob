import { describe, expect, it } from 'vitest';
import {
  RESUME_TEMPLATES,
  MASTER_CATALOG_TEMPLATES,
  templatePhotoSupport,
  templateAtsFriendly,
  templateColumns,
} from '../lib/resume-studio/templates';

const C3_CATALOG: Array<{ catalogId: string; name: string; photo: 'none' | 'optional' | 'required'; ats: boolean; columns: 1 | 2 }> = [
  { catalogId: 'TPL-01', name: 'Modern Professional', photo: 'optional', ats: false, columns: 1 },
  { catalogId: 'TPL-02', name: 'Classic Professional', photo: 'none', ats: true, columns: 1 },
  { catalogId: 'TPL-03', name: 'ATS-Friendly Simple', photo: 'none', ats: true, columns: 1 },
  { catalogId: 'TPL-04', name: 'Graduate Entry-Level', photo: 'optional', ats: true, columns: 1 },
  { catalogId: 'TPL-05', name: 'Academic CV', photo: 'none', ats: false, columns: 1 },
  { catalogId: 'TPL-06', name: 'Technology Professional', photo: 'none', ats: false, columns: 2 },
  { catalogId: 'TPL-07', name: 'Software Engineer', photo: 'none', ats: false, columns: 2 },
  { catalogId: 'TPL-08', name: 'Data Scientist', photo: 'none', ats: false, columns: 2 },
  { catalogId: 'TPL-09', name: 'Business Analyst', photo: 'none', ats: true, columns: 1 },
  { catalogId: 'TPL-10', name: 'Project Manager', photo: 'none', ats: true, columns: 1 },
  { catalogId: 'TPL-11', name: 'Marketing Professional', photo: 'optional', ats: false, columns: 2 },
  { catalogId: 'TPL-12', name: 'Sales Professional', photo: 'optional', ats: false, columns: 1 },
  { catalogId: 'TPL-13', name: 'Finance Professional', photo: 'none', ats: true, columns: 1 },
  { catalogId: 'TPL-14', name: 'Creative Professional', photo: 'optional', ats: false, columns: 2 },
  { catalogId: 'TPL-15', name: 'Executive Leadership', photo: 'none', ats: false, columns: 1 },
  { catalogId: 'TPL-16', name: 'International Professional', photo: 'optional', ats: false, columns: 1 },
  { catalogId: 'TPL-17', name: 'Career Change', photo: 'optional', ats: true, columns: 1 },
  { catalogId: 'TPL-18', name: 'Minimalist One-Page', photo: 'none', ats: true, columns: 1 },
  { catalogId: 'TPL-19', name: 'Modern Two-Column', photo: 'optional', ats: false, columns: 2 },
  { catalogId: 'TPL-20', name: 'Professional Photo Resume', photo: 'required', ats: false, columns: 2 },
];

describe('Master Upgrade template catalog (C3.1)', () => {
  it('ships exactly the 20 spec templates with exact names', () => {
    expect(MASTER_CATALOG_TEMPLATES).toHaveLength(20);
    for (const spec of C3_CATALOG) {
      const template = MASTER_CATALOG_TEMPLATES.find((t) => t.catalogId === spec.catalogId);
      expect(template, spec.catalogId).toBeDefined();
      expect(template!.name).toBe(spec.name);
    }
  });

  it('matches the spec photo, ATS, and column attributes for every entry', () => {
    for (const spec of C3_CATALOG) {
      const template = MASTER_CATALOG_TEMPLATES.find((t) => t.catalogId === spec.catalogId)!;
      expect(templatePhotoSupport(template)).toBe(spec.photo);
      expect(templateAtsFriendly(template)).toBe(spec.ats);
      expect(templateColumns(template)).toBe(spec.columns);
    }
  });

  it('grows the library to 70 unique templates without touching the original 50', () => {
    expect(RESUME_TEMPLATES).toHaveLength(70);
    expect(new Set(RESUME_TEMPLATES.map((t) => t.id)).size).toBe(70);
    expect(new Set(RESUME_TEMPLATES.map((t) => t.name)).size).toBe(70);
  });

  it('offers at least one photo-required template and honest badge helpers for legacy entries', () => {
    expect(MASTER_CATALOG_TEMPLATES.filter((t) => templatePhotoSupport(t) === 'required').length).toBe(1);
    const legacy = RESUME_TEMPLATES.find((t) => t.id === 'modern-tech')!;
    expect(templatePhotoSupport(legacy)).toBe('none');
    expect(templateColumns(legacy)).toBe(2);
    expect(templateAtsFriendly(legacy)).toBe(false);
  });
});
