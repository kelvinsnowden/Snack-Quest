import 'server-only';

import { redirect } from 'next/navigation';
import { requireStaffSession } from './session';
import { hasPermission, type PermissionKey } from './permissions';
import type { StaffSession } from '@/services/staffAuthService';

/**
 * A Finance, Warehouse or Support workspace page's gate: the role opens
 * the workspace, the permission opens the page. Someone without it goes
 * to a plain "no access" page, never back to the workspace home, which
 * may itself be a page they can't open.
 */
export async function requireWorkspacePage(permission: PermissionKey): Promise<StaffSession> {
  const session = await requireStaffSession();
  if (!hasPermission(session, permission)) {
    redirect(`/no-access?permission=${encodeURIComponent(permission)}`);
  }
  return session;
}
