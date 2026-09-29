import { redirect } from 'next/navigation';
import { requireStaffSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';

/** Staff access is not an admin section anyone can be given by area; it needs `users.manage` itself. */
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaffSession();
  if (!hasPermission(session, 'users.manage')) {
    redirect('/admin?accessDenied=users.manage');
  }
  return children;
}
