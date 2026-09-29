import 'server-only';

import { redirect } from 'next/navigation';
import { requireStaffSession } from './session';
import { canAccessAdminSection, type AdminSection } from './adminSections';
import { hasPermission, type PermissionKey } from './permissions';
import type { StaffSession } from '@/services/staffAuthService';

/** For a section's Server Component layout to call — redirects to the dashboard if this staff member can't reach `section`, so every page under that layout is covered without touching each `page.tsx`. */
export async function requireAdminSection(section: AdminSection): Promise<StaffSession> {
  const session = await requireStaffSession();
  if (!canAccessAdminSection(session, section)) {
    redirect(`/admin?accessDenied=${section}`);
  }
  return session;
}

/**
 * A page's own gate: its section must be open to this person and they
 * must hold the permission the page is about. Called from the page's
 * folder layout so every page beneath it is covered; the API routes the
 * page calls check their own permissions as well, so this is about not
 * showing someone a screen they can't use, not the only line of defence.
 */
export async function requireAdminPage(section: AdminSection, permission: PermissionKey): Promise<StaffSession> {
  const session = await requireAdminSection(section);
  if (!hasPermission(session, permission)) {
    redirect(`/admin?accessDenied=${encodeURIComponent(permission)}`);
  }
  return session;
}
