import { NextResponse, type NextRequest } from 'next/server';
import {
  STAFF_SESSION_COOKIE,
  CREATOR_SESSION_COOKIE,
} from '@/lib/auth/cookieName';
import {
  resolvePortal,
  toInternalPath,
  toPublicPath,
} from '@/lib/routing/subdomain';

/**
 * Two jobs, in order:
 *
 * 1. Host-based routing (§ Proper subdomain routing) — map
 *    `admin.` / `creators.` / `api.` / `status.` onto the route trees
 *    that serve them. See `lib/routing/subdomain.ts` for the rules.
 *
 * 2. The Optimistic tier of the two-tier auth check Next.js's own docs
 *    recommend (node_modules/next/dist/docs/01-app/02-guides/
 *    authentication.md, "Optimistic checks with Proxy") — a cheap
 *    cookie-presence check only, no Firebase Admin/Firestore call here.
 *    The Secure tier (real session-cookie verification, role checks, a
 *    Firestore read to catch a deactivated staff/creator account)
 *    happens in `app/admin/layout.tsx` / `app/creator/**` via
 *    `requireStaffSession()` / `requireCreatorSession()` — this file's
 *    only job is redirecting the obviously-wrong cases before a page
 *    even starts rendering, per that same doc's own caution against
 *    doing anything heavier here.
 *
 * The auth rules run against the *internal* path, so they behave
 * identically whether a visitor reached the portal via
 * `admin.snackquests.shop/orders` or `snackquests.shop/admin/orders`.
 * Redirect targets are converted back to public paths for the current
 * host before being issued.
 */

const ADMIN_LOGIN_PATH = '/admin/login';
// Reached from an invite/reset email before the invitee has any
// session — must stay open the same way ADMIN_LOGIN_PATH is, or the
// proxy bounces them to /admin/login before they can set a password.
const ADMIN_ACCEPT_INVITE_PATH = '/admin/accept-invite';
const CREATOR_LOGIN_PATH = '/creator/login';
// The only two /creator/* paths a signed-out visitor may reach —
// register also needs the cookie check below (redirect away once
// already signed in), not just an exemption from the sign-in gate.
const CREATOR_PUBLIC_PATHS = new Set(['/creator/login', '/creator/register']);

/**
 * Whether a path is inside the Creator Portal — the signed-in area at
 * `/creator`.
 *
 * A `startsWith('/creator')` test is not the same question, and getting
 * that wrong put the public `/creators` marketing page behind the
 * sign-in wall: anyone tapping "Creator program" while signed out was
 * bounced to `/creator/login?next=/creators`, so the page describing
 * the program was reachable only by people who had already joined it.
 * Matching on the segment boundary keeps `/creators`, and any future
 * `/creator*` marketing route, public.
 */
function isCreatorPortalPath(pathname: string): boolean {
  return pathname === '/creator' || pathname.startsWith('/creator/');
}

export function proxy(request: NextRequest): NextResponse {
  const portal = resolvePortal(request.headers.get('host'));
  const publicPathname = request.nextUrl.pathname;
  const pathname = toInternalPath(portal, publicPathname);

  const hasStaffSessionCookie = request.cookies.has(STAFF_SESSION_COOKIE);
  const hasCreatorSessionCookie = request.cookies.has(CREATOR_SESSION_COOKIE);

  const redirectTo = (
    internalTarget: string,
    nextPath?: string,
  ): NextResponse => {
    const url = new URL(toPublicPath(portal, internalTarget), request.url);
    if (nextPath) {
      url.searchParams.set('next', nextPath);
    }
    return NextResponse.redirect(url);
  };

  if (
    pathname.startsWith('/admin') &&
    pathname !== ADMIN_LOGIN_PATH &&
    pathname !== ADMIN_ACCEPT_INVITE_PATH &&
    !hasStaffSessionCookie
  ) {
    return redirectTo(ADMIN_LOGIN_PATH, pathname);
  }
  if (pathname === ADMIN_LOGIN_PATH && hasStaffSessionCookie) {
    return redirectTo('/admin');
  }

  if (
    isCreatorPortalPath(pathname) &&
    !CREATOR_PUBLIC_PATHS.has(pathname) &&
    !hasCreatorSessionCookie
  ) {
    return redirectTo(CREATOR_LOGIN_PATH, pathname);
  }
  if (CREATOR_PUBLIC_PATHS.has(pathname) && hasCreatorSessionCookie) {
    return redirectTo('/creator');
  }

  if (pathname !== publicPathname) {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

/**
 * Proxy now has to inspect the Host header on *every* page request,
 * not just `/admin` and `/creator`, so this is a negative matcher.
 * Excluded, per the Proxy guide's warning that an unfiltered matcher
 * also runs on static assets:
 *   - `api/`    — Route Handlers are never rewritten (see
 *                 `isRouteHandlerPath`); skipping them here keeps
 *                 webhook latency off this code path entirely.
 *   - `_next/*` — build output and the image optimizer.
 *   - anything with a file extension (`.svg`, `.ico`, `.txt`, `.xml`)
 *     — `public/` assets plus `robots.txt` and `sitemap.xml`. Without
 *     this, `/next.svg` on the admin host would rewrite to
 *     `/admin/next.svg` and 404.
 */
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\..*).*)'],
};
