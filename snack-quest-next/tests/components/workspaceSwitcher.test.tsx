// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AdminUserMenu } from '@/components/admin/AdminUserMenu';

/**
 * The workspace switcher, as it actually renders
 * (§ workspace switcher).
 *
 * `staffWorkspaces.test.ts` covers the rule; this covers the thing the
 * rule was for. An admin has always been permitted into the Warehouse
 * and never had a link to it, so the assertion that matters is not
 * "the array contains /warehouse" — it is that somebody with the menu
 * open can see the word and follow it.
 */

const push = vi.fn();
let pathname = '/admin';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: push, refresh: vi.fn() }),
  usePathname: () => pathname,
}));

afterEach(() => {
  cleanup();
  pathname = '/admin';
});

/*
 * Radix opens the menu on `pointerdown`, not `click`, so a plain
 * click leaves it shut — and every `queryBy...toBeNull()` assertion
 * below would then pass against an empty document while proving
 * nothing. `getBy` on the positive cases is what keeps that honest:
 * if the menu ever stops opening, those fail loudly rather than the
 * suite going quietly green.
 */
function open(roles: string[]) {
  render(<AdminUserMenu displayName="Kelvin Kimathi" email="k@example.com" role={roles[0]} roles={roles} />);
  fireEvent.pointerDown(
    screen.getByRole('button', { name: /account menu/i }),
    { button: 0, ctrlKey: false, pointerType: 'mouse' },
  );
}

describe('the workspace switcher in the staff menu', () => {
  /* The whole point of the change. */
  it('gives an admin a link into the warehouse', () => {
    open(['admin']);

    const warehouse = screen.getByRole('menuitem', { name: /warehouse/i });
    expect(warehouse.getAttribute('href')).toBe('/warehouse');
  });

  it('gives an admin every other workspace too', () => {
    open(['admin']);

    for (const [label, href] of [
      ['admin', '/admin'],
      ['warehouse', '/warehouse'],
      ['finance', '/finance'],
      ['support', '/agent'],
    ] as const) {
      expect(screen.getByRole('menuitem', { name: new RegExp(label, 'i') }).getAttribute('href')).toBe(href);
    }
  });

  /** Marked, so it is obvious which one you are already in. */
  it('marks the workspace you are currently in', () => {
    pathname = '/warehouse/recipes/abc';
    open(['admin']);

    expect(screen.getByRole('menuitem', { name: /warehouse/i }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('menuitem', { name: /finance/i }).getAttribute('aria-current')).toBeNull();
  });

  /*
   * A warehouse-only account has exactly one workspace, so the section
   * is not rendered at all — a "switch workspace" heading above a
   * single entry is a control that does nothing, on every screen that
   * person ever sees.
   */
  it('shows no switcher at all to someone with only one workspace', () => {
    open(['warehouse']);

    expect(screen.queryByText(/switch workspace/i)).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /finance/i })).toBeNull();
  });

  /** Never a link the admin layout would immediately redirect back out of. */
  it('never offers Admin to a finance-only account', () => {
    open(['finance']);

    expect(screen.queryByRole('menuitem', { name: /^admin/i })).toBeNull();
  });

  /** Logging out must survive the new section sitting above it. */
  it('still offers log out', () => {
    open(['admin']);

    expect(screen.getByRole('menuitem', { name: /log out/i })).toBeTruthy();
  });
});
