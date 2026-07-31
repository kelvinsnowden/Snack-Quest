import type { Metadata } from 'next';
import { requireStaffSession } from '@/lib/auth/session';
import { businessSettingsService } from '@/services/businessSettingsService';
import { BusinessSettingsForm } from '@/components/admin/BusinessSettingsForm';

export const metadata: Metadata = { title: 'Settings' };

export default async function AdminSettingsPage() {
  const session = await requireStaffSession();
  const business = await businessSettingsService.getSettings(session.businessId);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">This business&apos;s own configuration — name, currency, WhatsApp routing, and coverage.</p>
      </div>
      <BusinessSettingsForm
        initialValues={{
          name: business.name,
          currency: business.currency,
          whatsappPhoneNumberId: business.whatsappPhoneNumberId,
          countyCoverage: business.countyCoverage,
          adminWhatsappPhone: business.adminWhatsappPhone,
          status: business.status,
        }}
      />
    </div>
  );
}
