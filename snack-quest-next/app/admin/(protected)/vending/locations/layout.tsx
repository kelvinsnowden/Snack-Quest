import { requireAdminPage } from '@/lib/auth/requireAdminSection';

export default async function LocationsLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('vending', 'locations.view');
  return children;
}
