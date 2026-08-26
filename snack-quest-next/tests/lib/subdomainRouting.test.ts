import { describe, expect, it } from 'vitest';
import {
  resolvePortal,
  toInternalPath,
  toPublicPath,
  type Portal,
} from '@/lib/routing/subdomain';

describe('resolvePortal', () => {
  it('maps each production subdomain to its portal', () => {
    expect(resolvePortal('creators.snackquests.shop')).toBe('creator');
    expect(resolvePortal('admin.snackquests.shop')).toBe('admin');
    expect(resolvePortal('api.snackquests.shop')).toBe('api');
    expect(resolvePortal('status.snackquests.shop')).toBe('status');
  });

  it('serves the marketing site on the apex and www', () => {
    expect(resolvePortal('snackquests.shop')).toBe('marketing');
    expect(resolvePortal('www.snackquests.shop')).toBe('marketing');
  });

  it('leaves preview deployments and local development unrouted', () => {
    // Preview URLs and localhost must keep serving every route, the
    // way they did before host routing existed.
    expect(
      resolvePortal('snack-quest-abc123-kelvins-projects.vercel.app'),
    ).toBe('marketing');
    expect(resolvePortal('localhost:3000')).toBe('marketing');
  });

  it('ignores port and case in the Host header', () => {
    expect(resolvePortal('ADMIN.snackquests.shop:443')).toBe('admin');
    expect(resolvePortal('admin.localhost:3000')).toBe('admin');
  });

  it('falls back to marketing when the Host header is absent', () => {
    expect(resolvePortal(null)).toBe('marketing');
    expect(resolvePortal('')).toBe('marketing');
  });

  it('does not match a subdomain name embedded in a longer label', () => {
    expect(resolvePortal('admin-preview.vercel.app')).toBe('marketing');
  });
});

describe('toInternalPath', () => {
  it('rewrites the portal root', () => {
    expect(toInternalPath('admin', '/')).toBe('/admin');
    expect(toInternalPath('creator', '/')).toBe('/creator');
    expect(toInternalPath('api', '/')).toBe('/api-docs');
    expect(toInternalPath('status', '/')).toBe('/status');
  });

  it('prefixes nested paths', () => {
    expect(toInternalPath('admin', '/orders')).toBe('/admin/orders');
    expect(toInternalPath('creator', '/earnings')).toBe('/creator/earnings');
  });

  it('never rewrites the marketing host', () => {
    expect(toInternalPath('marketing', '/')).toBe('/');
    expect(toInternalPath('marketing', '/admin/orders')).toBe('/admin/orders');
    expect(toInternalPath('marketing', '/boxes')).toBe('/boxes');
  });

  it('is idempotent for already-prefixed paths', () => {
    // Typing /admin/orders directly on the admin host must not become
    // /admin/admin/orders.
    expect(toInternalPath('admin', '/admin/orders')).toBe('/admin/orders');
    expect(toInternalPath('admin', '/admin')).toBe('/admin');
    expect(toInternalPath('creator', '/creator/login')).toBe('/creator/login');
  });

  it('leaves Route Handlers alone on every host', () => {
    // Both login forms POST to these, and the webhook URLs registered
    // with Daraja/Jumia/Whatchimp are fixed.
    expect(toInternalPath('admin', '/api/auth/session')).toBe(
      '/api/auth/session',
    );
    expect(toInternalPath('creator', '/api/creator/session')).toBe(
      '/api/creator/session',
    );
    expect(toInternalPath('api', '/api/webhooks/daraja/snack-quest')).toBe(
      '/api/webhooks/daraja/snack-quest',
    );
  });

  it('does not treat a path merely starting with "api" as a Route Handler', () => {
    expect(toInternalPath('admin', '/apiary')).toBe('/admin/apiary');
  });
});

describe('toPublicPath', () => {
  it('strips the portal prefix so redirects stay on the current host', () => {
    // /admin/login on the admin host must be issued as /login, or it
    // would rewrite to /admin/admin/login and 404.
    expect(toPublicPath('admin', '/admin/login')).toBe('/login');
    expect(toPublicPath('creator', '/creator/login')).toBe('/login');
  });

  it('maps the portal root back to /', () => {
    expect(toPublicPath('admin', '/admin')).toBe('/');
    expect(toPublicPath('creator', '/creator')).toBe('/');
  });

  it('is a no-op on the marketing host', () => {
    expect(toPublicPath('marketing', '/admin/login')).toBe('/admin/login');
  });

  it('round-trips with toInternalPath', () => {
    const cases: Array<[Portal, string]> = [
      ['admin', '/orders'],
      ['admin', '/'],
      ['creator', '/earnings'],
      ['api', '/'],
      ['marketing', '/boxes'],
    ];
    for (const [portal, publicPath] of cases) {
      expect(toPublicPath(portal, toInternalPath(portal, publicPath))).toBe(
        publicPath,
      );
    }
  });
});

/**
 * The bug a warehouse staff member hit on their first sign-in: they
 * were invited, signed in at `admin.snackquests.shop`, and landed on
 * a 404 with no way forward.
 *
 * The chain was `/admin` → the admin layout sees a warehouse-only
 * session → `redirect('/warehouse')` → this function turned that into
 * `/admin/warehouse`, which does not exist in `app/`.
 */
describe('the other staff workspaces on the admin host', () => {
  it('serves /warehouse instead of rewriting it under /admin', () => {
    expect(toInternalPath('admin', '/warehouse')).toBe('/warehouse');
    expect(toInternalPath('admin', '/warehouse/inventory')).toBe('/warehouse/inventory');
  });

  it('does the same for the agent and finance workspaces', () => {
    expect(toInternalPath('admin', '/agent')).toBe('/agent');
    expect(toInternalPath('admin', '/finance')).toBe('/finance');
    expect(toInternalPath('admin', '/agent/conversations')).toBe('/agent/conversations');
  });

  /*
   * Only on a segment boundary. A marketing page whose path merely
   * begins with those letters is not a staff workspace, and must keep
   * being rewritten like anything else on this host.
   */
  it('matches on the segment boundary, not the prefix', () => {
    expect(toInternalPath('admin', '/agents')).toBe('/admin/agents');
    expect(toInternalPath('admin', '/financereport')).toBe('/admin/financereport');
  });

  it('leaves the real /admin pages alone', () => {
    expect(toInternalPath('admin', '/orders')).toBe('/admin/orders');
    expect(toInternalPath('admin', '/')).toBe('/admin');
  });

  /*
   * The signed-out case. A warehouse page bounces to
   * `/admin/login?next=…`, and that target has to survive this
   * function unchanged on the admin host or the login page itself
   * 404s.
   */
  it('keeps the login redirect target reachable', () => {
    expect(toInternalPath('admin', '/admin/login')).toBe('/admin/login');
  });
});
