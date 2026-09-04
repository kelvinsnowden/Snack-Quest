import { describe, expect, it } from 'vitest';
import { activeWorkspace, workspacesFor } from '@/lib/auth/staffWorkspaces';

/**
 * Which workspaces a person is offered (§ workspace switcher).
 *
 * This is a menu, not a lock — every workspace layout still checks the
 * session itself, and nothing here can grant access. What it can do is
 * offer a door that does not open, which is why the rules below are
 * pinned to the same gates the layouts apply: a link that bounces
 * somebody to a redirect is worse than no link at all.
 */

describe('workspacesFor', () => {
  /* The reason this exists: the permission was always there, unusable. */
  it('offers an admin every workspace, including the warehouse', () => {
    expect(workspacesFor(['admin']).map((w) => w.href)).toEqual([
      '/admin',
      '/warehouse',
      '/finance',
      '/agent',
    ]);
  });

  it('offers a super admin the same', () => {
    expect(workspacesFor(['super_admin'])).toHaveLength(4);
  });

  /*
   * A warehouse-only account gets exactly one entry, and the menu
   * renders no switcher at all for it — a list of one is a section
   * that says "you are where you must be".
   */
  it('offers a warehouse-only account only the warehouse', () => {
    expect(workspacesFor(['warehouse']).map((w) => w.href)).toEqual(['/warehouse']);
  });

  it('offers a finance-only account only finance', () => {
    expect(workspacesFor(['finance']).map((w) => w.href)).toEqual(['/finance']);
  });

  /*
   * Never Admin. Its layout redirects an agent-, warehouse- or
   * finance-only account straight back out, so linking there would
   * offer a round trip.
   */
  it('never offers Admin to staff the admin layout would redirect away', () => {
    for (const role of ['agent', 'warehouse', 'finance']) {
      expect(workspacesFor([role]).some((w) => w.href === '/admin')).toBe(false);
    }
  });

  /** Someone holding two focused roles gets both, and still not Admin. */
  it('unions multiple roles', () => {
    expect(workspacesFor(['warehouse', 'finance']).map((w) => w.href)).toEqual([
      '/warehouse',
      '/finance',
    ]);
  });

  it('offers nothing for no roles at all', () => {
    expect(workspacesFor([])).toEqual([]);
  });
});

describe('activeWorkspace', () => {
  it('recognises a workspace root', () => {
    expect(activeWorkspace('/warehouse')?.label).toBe('Warehouse');
  });

  it('recognises a page nested inside one', () => {
    expect(activeWorkspace('/warehouse/recipes/abc123')?.label).toBe('Warehouse');
    expect(activeWorkspace('/admin/orders/xyz')?.label).toBe('Admin');
  });

  /*
   * On a path boundary, not a bare prefix — otherwise a future
   * `/administration` route would light up the Admin tick.
   */
  it('does not match a path that merely starts with the same letters', () => {
    expect(activeWorkspace('/administration')).toBeNull();
    expect(activeWorkspace('/warehousing/x')).toBeNull();
  });

  it('returns nothing for a path outside every workspace', () => {
    expect(activeWorkspace('/')).toBeNull();
    expect(activeWorkspace('/checkout')).toBeNull();
  });
});
