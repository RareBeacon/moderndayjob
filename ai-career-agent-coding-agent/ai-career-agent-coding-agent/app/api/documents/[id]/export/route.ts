import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { parseDocumentContent, renderDocx, renderPdf } from '@/lib/documents/export';

export const dynamic = 'force-dynamic';

/**
 * GET /api/documents/[id]/export?format=pdf|docx
 *
 * Exports a generated document (CV / cover letter / answers) as PDF or DOCX.
 * Ownership is enforced by the user_id filter (IDOR-safe); the document is
 * rendered server-side and streamed as an attachment. No secrets involved.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const { id } = await params;
  const format = new URL(req.url).searchParams.get('format') ?? 'pdf';
  if (format !== 'pdf' && format !== 'docx') {
    return NextResponse.json({ error: 'INVALID_FORMAT' }, { status: 400 });
  }

  const { data } = await supabaseAdmin
    .from('generated_documents')
    .select('id, kind, title, content')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const parsed = parseDocumentContent(data.kind, data.content);
  const title = (data.title || parsed.title || 'document').trim();
  const buffer = format === 'docx'
    ? await renderDocx(title, parsed.sections)
    : await renderPdf(title, parsed.sections);

  const ext = format === 'docx' ? 'docx' : 'pdf';
  const mime = format === 'docx'
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : 'application/pdf';
  const safe = title.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'document';

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${safe}.${ext}"`,
      'Content-Length': String(buffer.byteLength),
    },
  });
}
