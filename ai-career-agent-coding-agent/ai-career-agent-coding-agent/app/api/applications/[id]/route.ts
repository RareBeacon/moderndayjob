import { requireUser } from '@/lib/auth';
import { AppActionError, getApplication } from '@/lib/applications/service';

/** Full application detail: row + job + prepared package + audit timeline. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  try {
    const detail = await getApplication(user.id, id);
    return Response.json(detail);
  } catch (error) {
    if (error instanceof AppActionError && error.code === 'NOT_FOUND') {
      return Response.json({ error: 'NOT_FOUND' }, { status: 404 });
    }
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }
    throw error;
  }
}
