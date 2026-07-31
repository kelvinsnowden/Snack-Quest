import { NextResponse, type NextRequest } from 'next/server';
import { STAFF_SESSION_COOKIE, CREATOR_SESSION_COOKIE } from '@/lib/auth/cookieName';

/**
 * The Optimistic tier of the two-tier auth check Next.js's own docs
 * recommend (node_modules/next/dist/docs/01-app/02-guides/
 * authentication.md, "Optimistic checks with Proxy") — a cheap
 * cookie-presence check only, no Firebase Admin/Firestore call here.
 * The Secure tier (real session-cookie verification, role checks, a
 * Firestore read to catch a deactivated staff/creator account)
 * happens in `app/admin/layout.tsx` / `app/creator/**` via
 * `requireStaffSession()` / `requireCreatorSession()` — this file's
 * only job is redirecting the obviously-wrong cases before a page
 * even starts rendering, per that same doc's own caution against
 * doing anything heavier here.
 */

const ADMIN_LOGIN_PATH = '/admin/login';
const CREATOR_LOGIN_PATH = '/creator/login';
// The only two /creator/* paths a signed-out visitor may reach —
// register also needs the cookie check below (redirect away once
// already signed in), not just an exemption from the sign-in gate.
const CREATOR_PUBLIC_PATHS = new Set(['/creator/login', '/creator/register']);

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const hasStaffSessionCookie = request.cookies.has(STAFF_SESSION_COOKIE);
  const hasCreatorSessionCookie = request.cookies.has(CREATOR_SESSION_COOKIE);

  if (pathname.startsWith('/admin') && pathname !== ADMIN_LOGIN_PATH && !hasStaffSessionCookie) {
    const url = new URL(ADMIN_LOGIN_PATH, request.url);
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  if (pathname === ADMIN_LOGIN_PATH && hasStaffSessionCookie) {
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  if (pathname.startsWith('/creator') && !CREATOR_PUBLIC_PATHS.has(pathname) && !hasCreatorSessionCookie) {
    const url = new URL(CREATOR_LOGIN_PATH, request.url);
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  if (CREATOR_PUBLIC_PATHS.has(pathname) && hasCreatorSessionCookie) {
    return NextResponse.redirect(new URL('/creator', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/creator/:path*'],
};
