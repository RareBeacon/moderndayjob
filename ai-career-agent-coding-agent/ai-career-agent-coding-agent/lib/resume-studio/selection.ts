import type { StudioDraft } from './draft';
import { RESUME_TEMPLATES } from './templates';

/** A gallery link can select a real template, never arbitrary draft content. */
export function requestedTemplateId(search: string): string | null {
  const id = new URLSearchParams(search).get('template');
  return id && RESUME_TEMPLATES.some((template) => template.id === id) ? id : null;
}

export function withRequestedTemplate(draft: StudioDraft, templateId: string | null): StudioDraft {
  return templateId ? { ...draft, selectedTemplate: templateId } : draft;
}
