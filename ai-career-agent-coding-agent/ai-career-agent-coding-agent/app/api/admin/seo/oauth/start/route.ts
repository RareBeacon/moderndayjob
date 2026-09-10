import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireAdminUser, adminErrorResponse } from '@/lib/admin';
import { buildGoogleAuthUrl } from '@/lib/seo/google';
import { ensureSeoProject, recordSeoAudit } from '@/lib/seo/service';

export async function GET(req: Request) {
  try {
    const admin = await requireAdminUser();
    const project = await ensureSeoProject();
    const state = crypto.randomBytes(24).toString('hex');
    const cookieStore = await cookies();
    cookieStore.set('seo_oauth_state', `${state}.${project.id}`, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    });
    await recordSeoAudit({ projectId: project.id, actorUserId: admin.id, action: 'SEO_GOOGLE_OAUTH_STARTED', targetType: 'project' });
    return NextResponse.redirect(buildGoogleAuthUrl({ state, requestOrigin: new URL(req.url).origin }));
  } catch (error) {
    return adminErrorResponse(error);
  }
}
