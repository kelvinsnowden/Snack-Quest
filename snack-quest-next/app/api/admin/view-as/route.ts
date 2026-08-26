import { getRealStaffSession } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { VIEW_AS_COOKIE, isViewableRole } from '@/lib/auth/viewAs';
import { publishEvent } from '@/lib/events/eventBus';

/**
 * A super admin choosing which role to look through, or stepping back
 * out of one (§ see it from every angle).
 *
 * Authorised against `getRealStaffSession()` — the session as it
 * really is, before any narrowing. That is not an oversight to tidy
 * up: the narrowing applies to Route Handlers too, so authorising
 * this against the *narrowed* roles would mean a super admin viewing
 * as `warehouse` could never switch back, because a warehouse account
 * may not make this call.
 *
 * The cookie is HttpOnly. Nothing about it grants a permission — it
 * can only ever remove some, and only for an account that already
 * holds every role — but a value the page's own scripts cannot read
 * or write is one less thing to reason about.
 *
 * Recorded as an event. A super admin's actions are still theirs while
 * they are looking through another role, and a reviewer reading an
 * audit trail should be able to see which hat was on.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await getRealStaffSession();
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return forbiddenResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const role = (body as { role?: unknown } | null)?.role;

  // `null` is how the client says "back to being myself".
  if (role === null) {
    await publishEvent(session.businessId, 'SuperAdminStoppedViewingAs', 'staff', session.uid, {
      staffUid: session.uid,
    });
    return Response.json(
      { ok: true, viewingAs: null },
      {
        headers: {
          'set-cookie': `${VIEW_AS_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
        },
      },
    );
  }

  if (!isViewableRole(role)) {
    return Response.json({ error: 'Not a role you can view as.' }, { status: 400 });
  }

  await publishEvent(session.businessId, 'SuperAdminStartedViewingAs', 'staff', session.uid, {
    staffUid: session.uid,
    role,
  });

  return Response.json(
    { ok: true, viewingAs: role },
    {
      headers: {
        // Session-length: looking through another role is something
        // you do for a few minutes, not a state to wake up in
        // tomorrow having forgotten about.
        'set-cookie': `${VIEW_AS_COOKIE}=${role}; Path=/; HttpOnly; SameSite=Lax`,
      },
    },
  );
}
