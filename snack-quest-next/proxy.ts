import { NextResponse, type NextRequest } from 'next/server';
import { STAFF_SESSION_COOKIE } from '@/lib/auth/cookieName';

/**
 * The Optimistic tier of the two-tier auth check Next.js's own docs
 * recommend (node_modules/next/dist/docs/01-app/02-guides/
 * authentication.md, "Optimistic checks with Proxy") — a cheap
 * cookie-presence check only, no Firebase Admin/Firestore call here.
 * The Secure tier (real session-cookie verification, role checks, a
 * Firestore read to catch a deactivated staff account) happens in
 * `app/admin/layout.tsx` via `requireStaffSession()` — this file's
 * only job is redirecting the two obviously-wrong cases before a
 * page even starts rendering, per that same doc's own caution against
 * doing anything heavier here.
 */

const LOGIN_PATH = '/admin/login';

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = request.cookies.has(STAFF_SESSION_COOKIE);

  if (pathname.startsWith('/admin') && pathname !== LOGIN_PATH && !hasSessionCookie) {
    const url = new URL(LOGIN_PATH, request.url);
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === LOGIN_PATH && hasSessionCookie) {
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/admin/:path*',
};
