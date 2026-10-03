import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  ROLE_TEMPLATES,
  SUPER_ADMIN_ONLY,
  canOpenSection,
  effectivePermissions,
  hasPermission,
  isPermissionKey,
} from '@/lib/auth/permissions';
import { applyViewAs } from '@/lib/auth/viewAs';

/**
 * The permission model. What matters:
 * - every staff route checks a permission (never a role), and every
 *   permission it checks exists;
 * - each role's default reproduces what that role could do before, apart
 *   from the three deliberate tightenings;
 * - individual grants and removals work, and a super admin can't be narrowed;
 * - the older "sections" narrowing of an admin still holds.
 */

describe('the catalogue', () => {
  it('has unique keys, each in a known group', () => {
    const keys = PERMISSIONS.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(isPermissionKey('sales.refund')).toBe(true);
    expect(isPermissionKey('sales.refund.everything')).toBe(false);
  });

  it('every template only uses real permissions', () => {
    for (const template of ROLE_TEMPLATES) {
      for (const key of template.permissions) expect(ALL_PERMISSIONS).toContain(key);
    }
  });
});

describe('role defaults', () => {
  const of = (role: string) => effectivePermissions({ roles: [role] });

  it('a super admin holds everything, and grants or removals cannot narrow them', () => {
    expect(effectivePermissions({ roles: ['super_admin'], revoked: ['users.manage'] })).toEqual([...ALL_PERMISSIONS]);
  });

  it('an admin holds everything except the super-admin-only permissions, which now include manufacturer keys', () => {
    const admin = of('admin');
    for (const key of SUPER_ADMIN_ONLY) expect(admin).not.toContain(key);
    expect(admin).not.toContain('integrations.credentials.manage');
    expect(admin).toContain('pricing.manage');
    expect(admin).toContain('sales.refund');
    expect(admin.length).toBe(ALL_PERMISSIONS.length - SUPER_ADMIN_ONLY.length);
  });

  it('warehouse runs machines and restocks, but never prices, registration, refunds or owner money', () => {
    const warehouse = of('warehouse');
    for (const key of ['restock.execute', 'machines.slots.toggle', 'machine_inventory.adjust', 'warehouse_fulfilment.manage'] as const) expect(warehouse).toContain(key);
    for (const key of ['pricing.manage', 'machines.create', 'machines.slots.configure', 'sales.refund', 'owner_finance.view', 'integrations.credentials.manage'] as const) expect(warehouse).not.toContain(key);
  });

  it('finance decides and refunds machine sales, and reads owner money, but changes nothing about machines', () => {
    const finance = of('finance');
    for (const key of ['sales.review.resolve', 'sales.refund', 'sales.export', 'owner_finance.view'] as const) expect(finance).toContain(key);
    for (const key of ['locations.manage', 'pricing.manage', 'machines.commands.issue', 'restock.plan'] as const) expect(finance).not.toContain(key);
  });

  it('support handles conversations and nothing that moves money', () => {
    expect(of('agent')).toEqual(expect.arrayContaining(['support.conversations.handle', 'logistics.courier.book']));
    expect(of('agent')).not.toContain('orders.refund');
    expect(of('agent')).not.toContain('sales.refund');
  });

  it('a customer or creator holds no staff permission', () => {
    expect(of('customer')).toEqual([]);
    expect(of('creator')).toEqual([]);
  });
});

describe('templates and overrides', () => {
  it('a template replaces the role default; grants add and removals subtract', () => {
    const person = effectivePermissions({ roles: ['admin'], template: 'marketing', granted: ['sales.view'], revoked: ['creators.manage'] });
    expect(person).toContain('marketing.campaigns.manage');
    expect(person).toContain('sales.view');
    expect(person).not.toContain('creators.manage');
    expect(person).not.toContain('pricing.manage');
  });

  it('ignores unknown permission names rather than trusting them', () => {
    expect(effectivePermissions({ roles: ['agent'], granted: ['everything', 'users.manage.all'] })).toEqual(effectivePermissions({ roles: ['agent'] }));
  });

  it('keeps honouring the older section narrowing for an admin nobody has moved to a template', () => {
    const vendingOnly = effectivePermissions({ roles: ['admin'], legacySections: ['vending'] });
    expect(vendingOnly).toContain('restock.plan');
    expect(vendingOnly).not.toContain('orders.refund');
    expect(vendingOnly).not.toContain('finance.withdrawals.approve');
    expect(vendingOnly).toContain('search.use');
    expect(canOpenSection({ roles: ['admin'], effectivePermissions: vendingOnly }, 'vending')).toBe(true);
    expect(canOpenSection({ roles: ['admin'], effectivePermissions: vendingOnly }, 'finance')).toBe(false);
  });

  it('hasPermission falls back to the role default when a session carries no computed list', () => {
    expect(hasPermission({ roles: ['warehouse'] }, 'restock.execute')).toBe(true);
    expect(hasPermission({ roles: ['warehouse'] }, 'pricing.manage')).toBe(false);
    expect(hasPermission({ roles: ['admin'], effectivePermissions: ['sales.view'] }, 'pricing.manage')).toBe(false);
  });
});

describe('view-as', () => {
  it('a super admin viewing as warehouse gets exactly warehouse’s default permissions', () => {
    const session = { uid: 'u', email: 'e', displayName: 'd', roles: ['super_admin' as const], businessId: 'b', permissions: [], effectivePermissions: [...ALL_PERMISSIONS] };
    const viewing = applyViewAs(session, 'warehouse');
    expect(viewing.effectivePermissions).toEqual(effectivePermissions({ roles: ['warehouse'] }));
    expect(hasPermission(viewing, 'pricing.manage')).toBe(false);
  });
});

describe('every staff route checks a permission', () => {
  const API = join(process.cwd(), 'app/api');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name === 'route.ts') files.push(path);
    }
  };
  walk(API);

  it('no route decides access by role any more', () => {
    const offenders = files.filter((file) => /hasStaffRole\(|withStaffRoles\(|isSuperAdmin\(|canUseWarehouse\(/.test(readFileSync(file, 'utf8')));
    expect(offenders.map((file) => file.slice(API.length))).toEqual([]);
  });

  it('every route that reads a staff session checks at least one permission that exists', () => {
    const exempt = ['/admin/locale/route.ts', '/storage/upload/route.ts', '/auth/session/route.ts', '/admin/view-as/route.ts', '/auth/staff/session/route.ts'];
    const missing: string[] = [];
    const unknown: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const rel = file.slice(API.length);
      if (!/verifyStaffSessionFromRequest|withPermission\(/.test(source) || exempt.some((path) => rel.endsWith(path))) continue;
      const checked = [...source.matchAll(/(?:hasPermission\(session,\s*|withPermission\(request,\s*|forbiddenForPermission\()'([a-z_.]+)'/g)].map((match) => match[1]);
      const anyOf = [...source.matchAll(/hasAnyPermission\(session,\s*\[([^\]]+)\]/g)].flatMap((match) => [...match[1].matchAll(/'([a-z_.]+)'/g)].map((m) => m[1]));
      const all = [...checked, ...anyOf];
      if (all.length === 0 && !/'\(device\)'|authenticateDevice/.test(source)) missing.push(rel);
      for (const key of all) if (!isPermissionKey(key)) unknown.push(`${rel}: ${key}`);
    }
    expect(missing).toEqual([]);
    expect(unknown).toEqual([]);
  });
});
