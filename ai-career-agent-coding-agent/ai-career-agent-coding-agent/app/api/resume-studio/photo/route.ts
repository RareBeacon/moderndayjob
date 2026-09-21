import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { validatePhotoBytes, photoDataUrl } from '@/lib/resume-studio/photo';

export const dynamic = 'force-dynamic';

/**
 * POST /api/resume-studio/photo
 *
 * Validates a resume photo server-side (magic-byte MIME check, 2 MB cap,
 * JPEG or PNG only because the PDF renderer cannot embed WebP) and returns
 * a data URL the client stores in its draft. The export pipeline re-validates
 * the stored value before embedding, so a bypassed client cannot smuggle
 * arbitrary bytes into a generated document.
 */
export async function POST(request: Request) {
  const rl = await enforceRateLimit(`resume-photo:${requestIp(request)}`, 20, '1 m');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await requireUser({ req: request }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'FILE_REQUIRED' }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = validatePhotoBytes(bytes);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    return NextResponse.json({ dataUrl: photoDataUrl(bytes, validation.mime), mime: validation.mime, bytes: bytes.length });
  } catch {
    return NextResponse.json({ error: 'UPLOAD_FAILED' }, { status: 500 });
  }
}
