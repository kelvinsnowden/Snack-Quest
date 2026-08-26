import { describe, expect, it } from 'vitest';
import { applyViewAs, isViewableRole, VIEWABLE_ROLES } from '@/lib/auth/viewAs';
import type { StaffSession } from '@/services/staffAuthService';

const SUPER: StaffSession = {
  uid: 'u1',
  email: 'boss@snackquest.co',
  displayName: 'Boss',
  roles: ['super_admin'],
  businessId: 'biz-1',
  permissions: [],
};

/**
 * A super admin looking through somebody else's role
 * (§ see it from every angle).
 *
 * The whole security question here is one-directional: this must only
 * ever be able to take permissions away. Everything below is a way of
 * asking whether it can be made to add any.
 */
describe('viewing as another role', () => {
  it('narrows a super admin to the chosen role', () => {
    const viewed = applyViewAs(SUPER, 'warehouse');

    expect(viewed.roles).toEqual(['warehouse']);
    expect(viewed.viewingAs).toBe('warehouse');
    // Identity is unchanged — the audit trail still names them.
    expect(viewed.uid).toBe('u1');
    expect(viewed.actualRoles).toEqual(['super_admin']);
  });

  /*
   * The attack this exists to refuse. A warehouse account that sets
   * the cookie by hand must gain nothing at all — not admin, not even
   * a different narrowing that might slip past a role check somewhere.
   */
  it('does nothing at all for an account that is not a super admin', () => {
    const warehouse: StaffSession = { ...SUPER, roles: ['warehouse'] };

    for (const role of [...VIEWABLE_ROLES, 'super_admin', 'customer']) {
      const viewed = applyViewAs(warehouse, role);
      expect(viewed.roles).toEqual(['warehouse']);
      expect(viewed.viewingAs).toBeUndefined();
    }
  });

  /** Not a way to become a super admin, for anyone, including one. */
  it('refuses super_admin as a role to view as', () => {
    expect(isViewableRole('super_admin')).toBe(false);
    expect(applyViewAs(SUPER, 'super_admin').roles).toEqual(['super_admin']);
    expect(applyViewAs(SUPER, 'super_admin').viewingAs).toBeUndefined();
  });

  it('ignores a value that is not a staff role', () => {
    for (const value of ['customer', 'creator', 'admin ', '', 'ADMIN', '["admin"]']) {
      expect(applyViewAs(SUPER, value).viewingAs).toBeUndefined();
    }
  });

  it('is a no-op when no role is chosen', () => {
    expect(applyViewAs(SUPER, undefined)).toEqual(SUPER);
  });

  /*
   * A super admin holds every role, so narrowing to any one of them
   * can only ever be a subset. This asserts the property rather than
   * the four cases, so a role added later cannot quietly widen it.
   */
  it('only ever produces a single role the account could already act as', () => {
    for (const role of VIEWABLE_ROLES) {
      const viewed = applyViewAs(SUPER, role);
      expect(viewed.roles).toHaveLength(1);
      expect(viewed.roles[0]).toBe(role);
      expect(viewed.roles).not.toContain('super_admin');
    }
  });
});
