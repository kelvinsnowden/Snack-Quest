import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, ROLE_TEMPLATES, SUPER_ADMIN_ONLY, effectivePermissions, explainPermissions, type PermissionKey } from '@/lib/auth/permissions';

/**
 * Each role template against what it must never do (§ PRODUCT MANAGER ROLE,
 * § GRANULAR PERMISSIONS, § RBAC UI), and the access explainer against the
 * function the server enforces with.
 */

const templateOf = (key: string) => effectivePermissions({ roles: [key === 'super_admin' ? 'super_admin' : 'admin'], template: key });

const MUST_NOT: Record<string, PermissionKey[]> = {
  product_manager: ['products.cost.view', 'products.cost.manage', 'products.wholesale.view', 'products.wholesale.manage', 'pricing.manage', 'finance.view', 'finance.machine_pnl.view', 'sales.refund', 'machines.commands.issue', 'users.manage'],
  marketing: ['products.cost.view', 'pricing.manage', 'finance.view', 'finance.machine_pnl.view', 'sales.refund', 'kiosk.publish', 'advertising.review', 'machines.commands.issue', 'users.manage'],
  finance: ['pricing.manage', 'products.cost.manage', 'products.wholesale.manage', 'machines.commands.issue', 'machines.economics.manage', 'kiosk.design', 'advertising.manage', 'users.manage'],
  warehouse: ['pricing.manage', 'finance.view', 'owner_finance.view', 'machines.credentials.manage', 'products.cost.manage', 'advertising.manage', 'users.manage'],
  machine_operations: ['finance.view', 'finance.machine_pnl.view', 'sales.refund', 'owner_finance.view', 'products.cost.manage', 'advertising.manage', 'kiosk.publish', 'users.manage'],
  agent: ['sales.refund', 'finance.view', 'machines.commands.issue', 'products.cost.view', 'pricing.manage', 'users.manage'],
  admin: [...SUPER_ADMIN_ONLY],
};

describe('role templates', () => {
  for (const [template, forbidden] of Object.entries(MUST_NOT)) {
    it(`${template} can’t: ${forbidden.join(', ')}`, () => {
      const granted = templateOf(template);
      for (const key of forbidden) expect(granted, `${template} must not have ${key}`).not.toContain(key);
    });
  }

  it('a product manager can do the product work', () => {
    expect(templateOf('product_manager')).toEqual(expect.arrayContaining(['products.view', 'products.manage', 'products.snacks.manage', 'products.recipes.manage']));
  });

  it('whoever runs campaigns can’t approve their own ads — review is someone else’s permission', () => {
    const marketing = templateOf('marketing');
    expect(marketing).toContain('advertising.manage');
    expect(marketing).not.toContain('advertising.review');
  });

  it('a super admin has everything; an admin everything but the super-admin-only list', () => {
    expect(templateOf('super_admin')).toEqual([...ALL_PERMISSIONS]);
    expect(templateOf('admin')).toEqual(ALL_PERMISSIONS.filter((key) => !SUPER_ADMIN_ONLY.includes(key)));
  });

  it('every permission is held by at least one template besides super admin, or is deliberately super-admin only', () => {
    const covered = new Set(ROLE_TEMPLATES.filter((t) => t.key !== 'super_admin').flatMap((t) => t.permissions));
    for (const key of ALL_PERMISSIONS) expect(covered.has(key) || SUPER_ADMIN_ONLY.includes(key), key).toBe(true);
  });
});

describe('access explainer', () => {
  const cases = [
    ...ROLE_TEMPLATES.map((t) => ({ roles: ['admin'], template: t.key })),
    { roles: ['warehouse'], template: null, granted: ['pricing.manage'], revoked: ['products.cost.view'] },
    { roles: ['finance'], template: 'finance', granted: ['kiosk.view', 'not.a.permission'], revoked: ['sales.refund'] },
    { roles: ['admin'], template: null, legacySections: ['vending'] },
    { roles: ['super_admin'], template: 'agent', revoked: ['users.manage'] },
  ];

  it('agrees with the enforced permissions, for every template and override mix', () => {
    for (const source of cases) {
      const effective = effectivePermissions(source);
      const explained = explainPermissions(source).rows.filter((row) => row.effective).map((row) => row.key);
      expect(explained).toEqual(effective);
    }
  });

  it('says where each permission comes from', () => {
    const { rows, origin } = explainPermissions({ roles: ['warehouse'], template: 'warehouse', granted: ['pricing.manage'], revoked: ['products.cost.view'] });
    const row = (key: string) => rows.find((r) => r.key === key)!;
    expect(origin).toBe('template');
    expect(row('restock.execute')).toMatchObject({ fromTemplate: true, grantedDirectly: false, removed: false, effective: true });
    expect(row('pricing.manage')).toMatchObject({ fromTemplate: false, grantedDirectly: true, effective: true });
    expect(row('products.cost.view')).toMatchObject({ fromTemplate: true, removed: true, effective: false });
    expect(row('finance.view')).toMatchObject({ fromTemplate: false, grantedDirectly: false, removed: false, effective: false });
  });

  it('a super admin keeps everything, whatever is removed', () => {
    const explained = explainPermissions({ roles: ['super_admin'], revoked: ['users.manage'] });
    expect(explained.origin).toBe('super_admin');
    expect(explained.rows.every((row) => row.effective && row.superAdmin)).toBe(true);
  });
});
