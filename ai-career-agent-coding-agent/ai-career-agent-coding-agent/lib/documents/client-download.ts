import type { DocumentMode } from '@/lib/resume-studio/draft';

export interface ClientExportOptions {
  documentId: string;
  format: 'pdf' | 'docx';
  templateId?: string | null;
  documentMode?: DocumentMode | null;
  returnPath?: string;
}

export function buildDocumentExportUrl({
  documentId,
  format,
  templateId,
  documentMode,
}: ClientExportOptions): string {
  const params = new URLSearchParams({ format });
  if (templateId) params.set('template', templateId);
  if (documentMode === 'cv' || documentMode === 'resume') {
    params.set('docType', documentMode);
  }
  return `/api/documents/${encodeURIComponent(documentId)}/export?${params.toString()}`;
}

export async function downloadExportedDocument(
  options: ClientExportOptions,
): Promise<{ ok: true; filename: string } | { ok: false; message: string }> {
  const href = buildDocumentExportUrl(options);
  try {
    const res = await fetch(href, { method: 'GET', credentials: 'same-origin' });
    if (res.status === 401) {
      if (typeof window !== 'undefined') {
        const nextPath = options.returnPath || window.location.pathname + window.location.search;
        window.location.assign(`/login?next=${encodeURIComponent(nextPath)}`);
      }
      return { ok: false, message: 'Please sign in again to download your document.' };
    }
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      return {
        ok: false,
        message:
          payload?.message ||
          (res.status === 429
            ? 'Too many export requests in a short window. Wait a few seconds and try again.'
            : 'Unable to export this document right now. Please try again.'),
      };
    }

    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const fallbackSuffix = options.documentMode === 'cv' ? 'cv' : 'resume';
    const filename = match?.[1] || `jobiest-${fallbackSuffix}.${options.format}`;

    if (typeof window !== 'undefined') {
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    }

    return { ok: true, filename };
  } catch {
    return {
      ok: false,
      message: 'Network connection interrupted while preparing your download. Please try again.',
    };
  }
}
