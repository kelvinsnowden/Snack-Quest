import 'server-only';

import { redirect } from 'next/navigation';
import { requireStaffSession } from './session';
import { canAccessAdminSection, type AdminSection } from './adminSections';
import type { StaffSession } from '@/services/staffAuthService';

/** For a section's Server Component layout to call — redirects to the dashboard if this staff member can't reach `section`, so every page under that layout is covered without touching each `page.tsx`. */
export async function requireAdminSection(section: AdminSection): Promise<StaffSession> {
  const session = await requireStaffSession();
  if (!canAccessAdminSection(session, section)) {
    redirect(`/admin?accessDenied=${section}`);
  }
  return session;
}
