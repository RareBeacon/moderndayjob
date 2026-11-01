import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import {
  isKnownResumeTemplateId,
  parseDocumentContent,
  renderDocx,
  renderPdf,
} from '@/lib/documents/export';
import { resolveTemplateSpec } from '@/lib/resume-studio/templates';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Export a generated document as PDF or DOCX with optional template override (?template=...).
 * Editing and re-downloading never consumes a credit.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const rl = await enforceRateLimit(`documents:export:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await requireUser({ req: req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const { id } = await ctx.params;
  const url = new URL(req.url);
  const format = (url.searchParams.get('format') ?? 'pdf').toLowerCase();
  if (format !== 'pdf' && format !== 'docx') {
    return NextResponse.json({ error: 'UNSUPPORTED_FORMAT' }, { status: 400 });
  }

  const requestedTemplate = url.searchParams.get('template');
  if (requestedTemplate && !isKnownResumeTemplateId(requestedTemplate)) {
    return NextResponse.json({ error: 'UNKNOWN_TEMPLATE' }, { status: 400 });
  }

  const { data: doc, error } = await supabaseAdmin
    .from('generated_documents')
    .select('id, user_id, kind, title, content')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !doc) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const docKind = (doc as { kind?: string; type?: string }).kind ?? (doc as { type?: string }).type ?? 'CV';
  const parsed = parseDocumentContent(docKind, doc.content ?? '', doc.title ?? docKind);
  const effectiveTemplateId =
    docKind === 'CV' && requestedTemplate && isKnownResumeTemplateId(requestedTemplate)
      ? requestedTemplate
      : parsed.templateId;

  const candidateSlug = (parsed.resume?.fullName || doc.title || docKind || 'resume')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);

  const templateSuffix =
    docKind === 'CV' && effectiveTemplateId
      ? `-${resolveTemplateSpec(effectiveTemplateId).pdfFileName.replace(/\.pdf$/i, '').toLowerCase()}`
      : '';

  const safeSlug = `${candidateSlug || 'document'}${templateSuffix}`;

  const buffer =
    format === 'pdf'
      ? await renderPdf(parsed.title, parsed.sections, parsed.photo, effectiveTemplateId, parsed.resume)
      : await renderDocx(parsed.title, parsed.sections, parsed.photo, effectiveTemplateId, parsed.resume);

  const mime =
    format === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${safeSlug}.${format}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
