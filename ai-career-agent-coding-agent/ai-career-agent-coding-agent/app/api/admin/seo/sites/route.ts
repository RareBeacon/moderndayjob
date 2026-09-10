import { requireAdminUser, adminErrorResponse } from '@/lib/admin';
import { ensureSeoProject, listGoogleSitesForProject } from '@/lib/seo/service';

export async function GET() {
  try {
    await requireAdminUser();
    const project = await ensureSeoProject();
    if (!project.google_oauth_ciphertext) {
      return Response.json({ error: 'GOOGLE_NOT_CONNECTED', sites: [] }, { status: 400 });
    }
    const sites = await listGoogleSitesForProject(project);
    return Response.json({ sites });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
