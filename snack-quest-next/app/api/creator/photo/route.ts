import { verifyCreatorSessionFromRequest } from '@/lib/auth/creatorSession';
import { creatorProfileService, InvalidProfileUpdateError } from '@/services/creatorProfileService';
import { CreatorNotFoundError } from '@/services/creatorDashboardService';

/** A creator setting/replacing their own profile photo (§ Creator Portal profile photos) — separate from `/api/creator/profile` since the URL lands on `users/{uid}`, a different document than that route writes. */
export async function PATCH(request: Request): Promise<Response> {
  const session = await verifyCreatorSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'Not signed in' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { photoURL } = (body ?? {}) as { photoURL?: unknown };
  if (photoURL !== null && typeof photoURL !== 'string') {
    return Response.json({ error: 'photoURL must be a string or null' }, { status: 400 });
  }

  try {
    await creatorProfileService.updatePhoto(session.businessId, session.uid, photoURL);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof InvalidProfileUpdateError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof CreatorNotFoundError) {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not update your photo' },
      { status: 500 },
    );
  }
}
