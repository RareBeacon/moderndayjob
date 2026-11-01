import type { DocumentMode, StudioDraft } from './draft';
import { ALL_TEMPLATES, CURATED_TEMPLATES } from './templates';

const PENDING_TEMPLATE_STORAGE_KEY = 'jobiest.pendingTemplateSelection';
const PENDING_SELECTION_TTL_MS = 1000 * 60 * 60 * 6;

export type PendingTemplateSelection = {
  templateId: string;
  documentMode?: DocumentMode;
  savedAt: number;
};

/** A gallery link can select a real template, never arbitrary draft content. */
export function requestedTemplateId(search: string): string | null {
  const id = new URLSearchParams(search).get('template')?.trim() ?? '';
  return id && ALL_TEMPLATES.some((template) => template.id === id) ? id : null;
}

export function curatedTemplateIds(): string[] {
  return CURATED_TEMPLATES.map((t) => t.id);
}

export function requestedDocumentMode(search: string): DocumentMode | null {
  const params = new URLSearchParams(search);
  const raw = (params.get('docType') ?? params.get('mode') ?? '').trim().toLowerCase();
  if (raw === 'cv' || raw === 'curriculum-vitae') return 'cv';
  if (raw === 'resume') return 'resume';
  return null;
}

export function withRequestedTemplate(
  draft: StudioDraft,
  templateId: string | null | undefined,
  documentMode?: DocumentMode | null,
): StudioDraft {
  const validTemplate =
    templateId && ALL_TEMPLATES.some((template) => template.id === templateId) ? templateId : null;
  if (!validTemplate && !documentMode) {
    return draft;
  }
  const nextMode = documentMode ?? draft.documentMode ?? 'resume';
  const nextVersionName =
    documentMode === 'cv' && (draft.versionName === 'General Resume' || draft.versionName === 'Master Resume')
      ? draft.versionName.replace(/Resume$/, 'CV')
      : documentMode === 'resume' && (draft.versionName === 'General CV' || draft.versionName === 'Master CV')
        ? draft.versionName.replace(/CV$/, 'Resume')
        : draft.versionName;

  return {
    ...draft,
    ...(validTemplate ? { selectedTemplate: validTemplate } : {}),
    ...(documentMode ? { documentMode: nextMode, versionName: nextVersionName } : {}),
  };
}

export function savePendingTemplateSelection(templateId: string, documentMode?: DocumentMode) {
  if (typeof window === 'undefined') return;
  if (!ALL_TEMPLATES.some((template) => template.id === templateId)) return;
  try {
    const payload: PendingTemplateSelection = {
      templateId,
      documentMode: documentMode === 'cv' ? 'cv' : 'resume',
      savedAt: Date.now(),
    };
    window.localStorage.setItem(PENDING_TEMPLATE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or privacy mode errors.
  }
}

export function consumePendingTemplateSelection(): { templateId: string; documentMode?: DocumentMode } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PENDING_TEMPLATE_STORAGE_KEY);
    if (!raw) return null;
    window.localStorage.removeItem(PENDING_TEMPLATE_STORAGE_KEY);
    const parsed = JSON.parse(raw) as Partial<PendingTemplateSelection>;
    if (
      typeof parsed?.templateId !== 'string' ||
      !ALL_TEMPLATES.some((template) => template.id === parsed.templateId)
    ) {
      return null;
    }
    if (typeof parsed.savedAt === 'number' && Date.now() - parsed.savedAt > PENDING_SELECTION_TTL_MS) {
      return null;
    }
    return {
      templateId: parsed.templateId,
      documentMode: parsed.documentMode === 'cv' ? 'cv' : 'resume',
    };
  } catch {
    return null;
  }
}
