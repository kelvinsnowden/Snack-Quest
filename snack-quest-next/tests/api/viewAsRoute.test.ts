import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getRealStaffSessionMock } = vi.hoisted(() => ({
  getRealStaffSessionMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  getRealStaffSession: getRealStaffSessionMock,
}));
vi.mock('@/lib/events/eventBus', () => ({ publishEvent: vi.fn() }));

import { POST as viewAsRoute } from '@/app/api/admin/view-as/route';

const SUPER = {
  uid: 'u1',
  email: 'boss@snackquest.co',
  displayName: 'Boss',
  roles: ['super_admin'],
  businessId: 'biz-1',
  permissions: [],
};

function call(body: unknown) {
  return viewAsRoute(
    new Request('http://localhost/api/admin/view-as', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

describe('POST /api/admin/view-as', () => {
  beforeEach(() => getRealStaffSessionMock.mockReset());

  it('401s without a staff session', async () => {
    getRealStaffSessionMock.mockResolvedValue(null);
    expect((await call({ role: 'warehouse' })).status).toBe(401);
  });

  it('403s anyone who is not a super admin', async () => {
    getRealStaffSessionMock.mockResolvedValue({ ...SUPER, roles: ['admin'] });
    const response = await call({ role: 'warehouse' });
    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('sets an HttpOnly cookie for a role that can be viewed', async () => {
    getRealStaffSessionMock.mockResolvedValue(SUPER);

    const response = await call({ role: 'warehouse' });

    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('sq_view_as=warehouse');
    expect(cookie).toContain('HttpOnly');
  });

  it('refuses super_admin, and anything that is not a staff role', async () => {
    getRealStaffSessionMock.mockResolvedValue(SUPER);

    for (const role of ['super_admin', 'customer', 'creator', 'nonsense', 42]) {
      const response = await call({ role });
      expect(response.status).toBe(400);
      expect(response.headers.get('set-cookie')).toBeNull();
    }
  });

  /*
   * The one that would strand somebody. The narrowing applies to Route
   * Handlers too, so if this route authorised against the *narrowed*
   * roles, a super admin viewing as warehouse could never take the hat
   * off — a warehouse account may not call this. It reads the real
   * session instead, which is why the mock here is the real one.
   */
  it('lets a super admin who is currently viewing as another role switch back', async () => {
    // What `getRealStaffSession` returns: the session as it really is,
    // regardless of the cookie narrowing every other caller sees.
    getRealStaffSessionMock.mockResolvedValue(SUPER);

    const response = await call({ role: null });

    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('sq_view_as=');
    expect(cookie).toContain('Max-Age=0');
  });
});
