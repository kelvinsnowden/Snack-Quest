/**
 * Which navigation item the current URL belongs to.
 *
 * Non-trivial because the Creator Portal is reachable on two hosts
 * (§ Proper subdomain routing). On `creators.snackquests.shop` the
 * browser URL is `/referrals`, while on the apex it is
 * `/creator/referrals` — the same screen, and the same nav item must
 * light up for both. Links stay written as `/creator/*` everywhere
 * because `toInternalPath` is idempotent, so those URLs resolve on
 * either host; only the comparison needs normalizing.
 *
 * Kept pure and separate from the component so the two-host behavior
 * is unit-testable without rendering a route.
 */

/** `/creator/referrals` and `/referrals` both normalize to `/referrals`. */
function normalize(path: string): string {
  const withoutPortal = path.replace(/^\/creator(?=\/|$)/, '');
  const withoutTrailingSlash = withoutPortal.replace(/\/+$/, '');
  return withoutTrailingSlash === '' ? '/' : withoutTrailingSlash;
}

export function isActiveNavPath(pathname: string, href: string): boolean {
  const current = normalize(pathname);
  const target = normalize(href);

  // The portal root would otherwise prefix-match every other route.
  if (target === '/') {
    return current === '/';
  }
  return current === target || current.startsWith(`${target}/`);
}
