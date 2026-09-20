import { requireAdminUser, adminErrorResponse } from '@/lib/admin';
import { ensureSeoProject, listGoogleSitesForProject } from '@/lib/seo/service';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

export async function GET(req: Request) {
  const rl = await enforceRateLimit(`admin:seo:sites:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

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
