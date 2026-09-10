import { z } from 'zod';
import { requireAdminUser, adminErrorResponse } from '@/lib/admin';
import { ensureSeoProject, getSeoDashboardData, selectSeoProperty, setSeoPaused } from '@/lib/seo/service';

const postBody = z.object({
  property: z.string().min(3).max(300),
  sitemapUrl: z.string().url().optional(),
});

const patchBody = z.object({
  paused: z.boolean().optional(),
  mode: z.enum(['DRAFT', 'AUTONOMOUS']).optional(),
});

export async function GET() {
  try {
    await requireAdminUser();
    return Response.json(await getSeoDashboardData());
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdminUser();
    const project = await ensureSeoProject();
    const body = postBody.parse(await req.json());
    await selectSeoProperty({ projectId: project.id, actorUserId: admin.id, property: body.property, sitemapUrl: body.sitemapUrl });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: 'INVALID_BODY', issues: error.issues }, { status: 400 });
    return adminErrorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const admin = await requireAdminUser();
    const project = await ensureSeoProject();
    const body = patchBody.parse(await req.json());
    if (typeof body.paused === 'boolean') await setSeoPaused(project.id, body.paused, admin.id);
    if (body.mode) {
      const { supabaseAdmin } = await import('@/lib/supabase');
      await supabaseAdmin.from('seo_projects').update({ mode: body.mode, updated_at: new Date().toISOString() }).eq('id', project.id);
    }
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: 'INVALID_BODY', issues: error.issues }, { status: 400 });
    return adminErrorResponse(error);
  }
}
