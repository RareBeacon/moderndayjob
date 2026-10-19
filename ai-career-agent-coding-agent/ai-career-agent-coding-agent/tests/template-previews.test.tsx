import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResumeDocumentPreview } from '@/components/resume/ResumeDocumentPreview';
import { TemplateGallery } from '@/components/resume/TemplateGallery';
import { SAMPLE_PREVIEW_DRAFT } from '@/lib/resume-studio/sample';
import { freshDraft } from '@/lib/resume-studio/prefill';
import { requestedTemplateId, withRequestedTemplate } from '@/lib/resume-studio/selection';
import { RESUME_TEMPLATES, templatePhotoSupport } from '@/lib/resume-studio/templates';

const base = RESUME_TEMPLATES[0];

describe('real template previews', () => {
  it('renders actual fictional CV sections for every one of the 30 designs in mini and full size', () => {
    expect(RESUME_TEMPLATES).toHaveLength(30);
    for (const template of RESUME_TEMPLATES) {
      const mini = renderToStaticMarkup(<ResumeDocumentPreview template={template} draft={SAMPLE_PREVIEW_DRAFT} size="mini" demo />);
      const full = renderToStaticMarkup(<ResumeDocumentPreview template={template} draft={SAMPLE_PREVIEW_DRAFT} demo />);
      for (const html of [mini, full]) {
        expect(html, template.id).toContain(`data-template-id="${template.id}"`);
        expect(html, template.id).toContain(`data-layout="${template.layout}"`);
        expect(html, template.id).toContain('Alex Morgan');
        expect(html, template.id).toContain('alex.morgan@example.com');
        expect(html, template.id).toContain('Northstar Labs');
        expect(html, template.id).toContain('Lakeview University');
        expect(html, template.id).toContain('Service Insights Dashboard');
        expect(html, template.id).toContain('data-section="skills"');
        expect(html, template.id).not.toContain('miniLine');
      }
      // The small paper is the same document, rather than a decorative card.
      expect(mini.match(/<article\b[\s\S]*<\/article>/)?.[0], template.id).toBe(full.match(/<article\b[\s\S]*<\/article>/)?.[0]);
      expect(mini.includes('Fictional sample portrait'), template.id).toBe(templatePhotoSupport(template) !== 'none');
    }
  });

  it('exposes all designs in the public gallery with a full-size action and matching selection link', () => {
    const html = renderToStaticMarkup(<TemplateGallery templates={RESUME_TEMPLATES} />);
    expect(html.match(/data-preview-size="mini"/g)).toHaveLength(30);
    expect(html.match(/Preview full size/g)).toHaveLength(30);
    expect(html.match(/Use this template/g)).toHaveLength(30);
    for (const template of RESUME_TEMPLATES) {
      expect(html).toContain(`/generate?template=${template.id}`);
    }
  });

  it('does not substitute sample data into the real draft or its live preview', () => {
    const draft = freshDraft();
    const html = renderToStaticMarkup(<ResumeDocumentPreview template={base} draft={draft} />);
    expect(html).not.toContain('Alex Morgan');
    expect(html).not.toContain('alex.morgan@example.com');
    expect(JSON.stringify(draft)).not.toContain('Northstar Labs');
  });

  it('carries a validated gallery selection through both empty and populated drafts without replacing user data', () => {
    for (const template of RESUME_TEMPLATES) {
      const selected = requestedTemplateId(`?template=${encodeURIComponent(template.id)}`);
      expect(selected, template.id).toBe(template.id);
      const userDraft = { ...freshDraft(), personal: { ...freshDraft().personal, name: 'Real User' } };
      const picked = withRequestedTemplate(userDraft, selected);
      expect(picked.selectedTemplate).toBe(template.id);
      expect(picked.personal.name).toBe('Real User');
      expect(JSON.stringify(picked)).not.toContain('Northstar Labs');
    }
    expect(requestedTemplateId('?template=not-a-template')).toBeNull();
    expect(requestedTemplateId('?other=value')).toBeNull();
    const existing = { ...freshDraft(), selectedTemplate: 'minimal-air' };
    expect(withRequestedTemplate(existing, requestedTemplateId('?template=bad'))).toBe(existing);
  });
});
