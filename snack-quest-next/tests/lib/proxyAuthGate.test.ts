import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import { CREATOR_SESSION_COOKIE } from '@/lib/auth/cookieName';

/**
 * The signed-out gate in `proxy.ts` (§ Proper subdomain routing).
 *
 * These exist because `pathname.startsWith('/creator')` also matches
 * `/creators`, which put the public Creator Program marketing page
 * behind the sign-in wall — the page whose whole job is recruiting
 * people who are not signed in yet.
 */

function request(path: string, cookie?: string): NextRequest {
  const req = new NextRequest(new URL(`https://www.snackquests.shop${path}`));
  if (cookie) {
    req.cookies.set(CREATOR_SESSION_COOKIE, cookie);
  }
  return req;
}

/** A redirect response carries a Location; a rewrite/next does not. */
function redirectTarget(response: Response): string | null {
  const location = response.headers.get('location');
  return location ? new URL(location).pathname + new URL(location).search : null;
}

describe('proxy creator gate', () => {
  it('lets a signed-out visitor reach the public /creators marketing page', () => {
    expect(redirectTarget(proxy(request('/creators')))).toBeNull();
  });

  it('still gates the portal itself for a signed-out visitor', () => {
    expect(redirectTarget(proxy(request('/creator')))).toBe(
      '/creator/login?next=%2Fcreator',
    );
    expect(redirectTarget(proxy(request('/creator/earnings')))).toBe(
      '/creator/login?next=%2Fcreator%2Fearnings',
    );
  });

  it('leaves sign-in and sign-up reachable when signed out', () => {
    expect(redirectTarget(proxy(request('/creator/login')))).toBeNull();
    expect(redirectTarget(proxy(request('/creator/register')))).toBeNull();
  });

  it('sends an already-signed-in creator from sign-in to their dashboard', () => {
    expect(redirectTarget(proxy(request('/creator/login', 'session')))).toBe('/creator');
  });

  it('does not redirect a signed-in creator away from the marketing page', () => {
    expect(redirectTarget(proxy(request('/creators', 'session')))).toBeNull();
  });
});
