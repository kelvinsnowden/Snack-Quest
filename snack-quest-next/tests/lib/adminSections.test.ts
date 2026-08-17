import { describe, expect, it } from 'vitest';
import { canAccessAdminSection, visibleAdminSections, isAdminSection } from '@/lib/auth/adminSections';

/**
 * `canAccessAdminSection`/`visibleAdminSections` (§ Staff access
 * control) — pure functions, so these run with no emulator: the real
 * per-business-document Firestore round-trip is covered separately by
 * `tests/services/staffAuthService.test.ts` (session.permissions) and
 * `tests/services/staffManagementService.test.ts` (storing/validating
 * permissions).
 */

function session(roles: string[], permissions: string[]) {
  return { roles: roles as never, permissions };
}

describe('canAccessAdminSection', () => {
  it('lets a super_admin reach every section regardless of permissions', () => {
    expect(canAccessAdminSection(session(['super_admin'], []), 'finance')).toBe(true);
    expect(canAccessAdminSection(session(['super_admin'], ['orders']), 'finance')).toBe(true);
  });

  it('lets an admin with no permissions reach every section (unrestricted default)', () => {
    expect(canAccessAdminSection(session(['admin'], []), 'orders')).toBe(true);
    expect(canAccessAdminSection(session(['admin'], []), 'finance')).toBe(true);
  });

  it('restricts an admin with a non-empty permissions array to exactly those sections', () => {
    const restricted = session(['admin'], ['orders']);
    expect(canAccessAdminSection(restricted, 'orders')).toBe(true);
    expect(canAccessAdminSection(restricted, 'finance')).toBe(false);
  });
});

describe('visibleAdminSections', () => {
  it('returns null (unrestricted) for a super_admin', () => {
    expect(visibleAdminSections(session(['super_admin'], ['orders']))).toBeNull();
  });

  it('returns null (unrestricted) for an admin with an empty permissions array', () => {
    expect(visibleAdminSections(session(['admin'], []))).toBeNull();
  });

  it('returns exactly the granted sections for a restricted admin', () => {
    expect(visibleAdminSections(session(['admin'], ['orders', 'finance']))).toEqual(['orders', 'finance']);
  });
});

describe('isAdminSection', () => {
  it('accepts every real section key', () => {
    for (const key of ['orders', 'finance', 'marketing', 'conversations', 'operations']) {
      expect(isAdminSection(key)).toBe(true);
    }
  });

  it('rejects an unknown string, including "staff" (deliberately not a toggleable section)', () => {
    expect(isAdminSection('staff')).toBe(false);
    expect(isAdminSection('not-a-real-section')).toBe(false);
  });
});
