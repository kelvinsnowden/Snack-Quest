import { describe, expect, it } from 'vitest';
import { isPermissionKey } from '@/lib/auth/permissions';
import { readRoutes } from '@/lib/audit/routeInventory';

/**
 * Every API method, read from the code (§ CAPABILITY MATRIX — guard test).
 * Per method, not per file: a file where GET checks a permission and POST
 * forgets doesn't pass. A new route with no authentication at all fails
 * here until it is added to the public list with a reason.
 */

const routes = readRoutes(process.cwd());
const key = (route: { method: string; path: string }) => `${route.method} ${route.path}`;

/** Deliberately public, and why. */
const PUBLIC: Record<string, string> = {
  'POST /api/analytics/event': 'anonymous page analytics',
  'GET /api/checkout/web/[sessionId]': 'the unguessable checkout session id is the bearer',
  'GET /api/creator/referral-code': 'checks whether a referral code is free',
  'POST /api/invest/interest': 'public lead form',
  'POST /api/machine-owners/interest': 'public lead form',
  'GET /api/pickup-stations': 'public list of pickup points',
  'GET /api/premium-snacks': 'public catalogue',
  'POST /api/reviews': 'public review form (rate-limited, image checks in storage)',
  'POST /api/reviews/video': 'public review form',
  'POST /api/sms/opt-out': 'anyone may opt out of SMS',
};

/** Read a staff session but deliberately check no permission. */
const STAFF_WITHOUT_PERMISSION: Record<string, string> = {
  'POST /api/admin/locale': 'a person’s own language choice',
  'POST /api/storage/upload': 'upload only; the record that uses the file checks its own permission (and ads are refused here)',
};

describe('route guard', () => {
  it('reads every route method', () => {
    expect(routes.length).toBeGreaterThan(300);
  });

  it('every staff method checks at least one permission, and every permission named exists', () => {
    const missing = routes.filter((route) => route.auth.includes('staff') && route.permissions.length === 0 && !STAFF_WITHOUT_PERMISSION[key(route)]).map(key);
    const unknown = routes.flatMap((route) => route.permissions.filter((permission) => permission !== '(chosen at run time)' && !isPermissionKey(permission)).map((permission) => `${key(route)}: ${permission}`));
    expect(missing).toEqual([]);
    expect(unknown).toEqual([]);
  });

  it('the only unauthenticated methods are the listed public ones', () => {
    const open = routes.filter((route) => route.auth.includes('public')).map(key).sort();
    expect(open).toEqual(Object.keys(PUBLIC).sort());
  });

  it('nothing under /api/vending or /api/admin is public', () => {
    const exposed = routes.filter((route) => /^\/api\/(vending|admin)\//.test(route.path) && route.auth.includes('public')).map(key);
    expect(exposed).toEqual([]);
  });

  it('device routes never also accept a staff session, and staff routes never accept a device', () => {
    const mixed = routes.filter((route) => route.auth.includes('device') && route.auth.includes('staff')).map(key);
    expect(mixed).toEqual([]);
  });

  it('every staff write on the screen, advertising and economics surfaces is audited', () => {
    const surfaces = /^\/api\/vending\/(kiosk|advertising)|^\/api\/vending\/machines\/\[id\]\/(economics|display|service-codes|slots\/remove)|^\/api\/admin\/products\/.*\/prices/;
    const unaudited = routes.filter((route) => surfaces.test(route.path) && route.method !== 'GET' && route.auth.includes('staff') && !route.audited).map(key);
    expect(unaudited).toEqual([]);
  });
});
