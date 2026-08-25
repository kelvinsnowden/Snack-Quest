import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import {
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_COOKIE_NAME,
  isSupportedLocale,
} from '@/lib/i18n/locales';

/**
 * `POST /api/admin/locale` — remembers which language a staff member
 * reads the portal in (§ Admin in Simplified Chinese).
 *
 * Set server-side rather than with `document.cookie`, so the value is
 * `HttpOnly` and `SameSite=Lax` like every other cookie this app sets,
 * and so an unrecognised locale is rejected here rather than stored
 * and quietly ignored on every subsequent render.
 *
 * Behind the staff session because it is an admin preference, not
 * because a wrong language is dangerous — it decides nothing but which
 * words are drawn.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const locale = (body as { locale?: unknown } | null)?.locale;
  if (!isSupportedLocale(locale)) {
    return Response.json({ error: 'unsupported locale' }, { status: 400 });
  }

  const response = Response.json({ locale });
  response.headers.append(
    'set-cookie',
    `${LOCALE_COOKIE_NAME}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax; HttpOnly${
      process.env.NODE_ENV === 'production' ? '; Secure' : ''
    }`,
  );
  return response;
}
