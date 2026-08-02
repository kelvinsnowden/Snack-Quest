/**
 * Host-based routing (§ Proper subdomain routing). Each subdomain
 * serves a different application from the same deployment:
 *
 *   snackquests.shop / www      → marketing site   (no rewrite)
 *   creators.snackquests.shop   → /creator/*
 *   admin.snackquests.shop      → /admin/*
 *   api.snackquests.shop        → /api-docs/*
 *   status.snackquests.shop     → /status
 *
 * Pure functions with no Next.js imports so `proxy.ts` stays
 * dependency-light (the Proxy guide warns against pulling shared
 * modules into it) and so every rule below is unit-testable without
 * standing up a request.
 *
 * Rewrites, not redirects, on purpose: the browser stays on
 * `admin.snackquests.shop`, so the host-only session cookies
 * (`sq_staff_session` / `sq_creator_session` are set without a
 * `domain` attribute) keep working. A redirect to a different host
 * would drop the session on every navigation.
 */

export type Portal = 'marketing' | 'creator' | 'admin' | 'api' | 'status';

/**
 * Matched against the host's leftmost label. Anything unlisted —
 * `www`, the apex, `*.vercel.app` preview URLs, `localhost` — falls
 * through to `marketing`, which is the historical behavior and keeps
 * preview deployments and local development serving every route.
 */
const PORTAL_BY_SUBDOMAIN: Record<string, Portal> = {
  creators: 'creator',
  admin: 'admin',
  api: 'api',
  status: 'status',
};

/** Where each portal's routes actually live in `app/`. */
const PORTAL_ROOT: Record<Exclude<Portal, 'marketing'>, string> = {
  creator: '/creator',
  admin: '/admin',
  api: '/api-docs',
  status: '/status',
};

export function resolvePortal(host: string | null | undefined): Portal {
  if (!host) {
    return 'marketing';
  }
  // Strip the port (`admin.localhost:3000`) and normalize case before
  // reading the leftmost label.
  const hostname = host.split(':')[0].toLowerCase();
  const firstLabel = hostname.split('.')[0];
  return PORTAL_BY_SUBDOMAIN[firstLabel] ?? 'marketing';
}

/**
 * Route Handlers are never rewritten. Both login forms POST to
 * `/api/auth/session` and `/api/creator/session` from whichever host
 * the user is on, and Daraja/Jumia/Whatchimp webhooks are registered
 * against fixed `/api/webhooks/*` URLs — prefixing either would break
 * them. `api.snackquests.shop/api/webhooks/...` therefore still
 * reaches the real handler while `api.snackquests.shop/` serves the
 * documentation.
 */
function isRouteHandlerPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

/**
 * Public URL → the path inside `app/` that should render it.
 * Idempotent: an already-prefixed path (`/admin/orders` typed
 * directly on the admin host) is returned unchanged rather than
 * becoming `/admin/admin/orders`.
 */
export function toInternalPath(portal: Portal, pathname: string): string {
  if (portal === 'marketing' || isRouteHandlerPath(pathname)) {
    return pathname;
  }
  const root = PORTAL_ROOT[portal];
  if (pathname === root || pathname.startsWith(`${root}/`)) {
    return pathname;
  }
  return pathname === '/' ? root : `${root}${pathname}`;
}

/**
 * The inverse, used to build redirect targets. Proxy's auth checks
 * run against internal paths, but a redirect has to send the browser
 * to a URL that is valid *on the current host* — on the admin host
 * that is `/login`, not `/admin/login`, which would rewrite to
 * `/admin/admin/login` and 404.
 */
export function toPublicPath(portal: Portal, internalPath: string): string {
  if (portal === 'marketing') {
    return internalPath;
  }
  const root = PORTAL_ROOT[portal];
  if (internalPath === root) {
    return '/';
  }
  if (internalPath.startsWith(`${root}/`)) {
    return internalPath.slice(root.length);
  }
  return internalPath;
}
