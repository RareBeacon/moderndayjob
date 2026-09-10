import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireAdminUser, adminErrorResponse } from '@/lib/admin';
import { exchangeGoogleCode } from '@/lib/seo/google';
import { recordSeoAudit, storeGoogleTokens } from '@/lib/seo/service';

export async function GET(req: Request) {
  try {
    const admin = await requireAdminUser();
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    const origin = url.origin;
    if (error) return NextResponse.redirect(`${origin}/admin/seo?google_error=${encodeURIComponent(error)}`);
    if (!code || !state) throw new Error('GOOGLE_OAUTH_CODE_OR_STATE_MISSING');

    const cookieStore = await cookies();
    const stored = cookieStore.get('seo_oauth_state')?.value;
    cookieStore.delete('seo_oauth_state');
    const [storedState, projectId] = (stored ?? '').split('.');
    if (!storedState || storedState !== state || !projectId) throw new Error('GOOGLE_OAUTH_STATE_INVALID');

    const tokens = await exchangeGoogleCode({ code, requestOrigin: origin });
    await storeGoogleTokens(projectId, tokens);
    await recordSeoAudit({ projectId, actorUserId: admin.id, action: 'SEO_GOOGLE_OAUTH_CONNECTED', targetType: 'project', metadata: { scope: tokens.rawScope ?? null } });
    return NextResponse.redirect(`${origin}/admin/seo?connected=1`);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
