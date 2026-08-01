import type { Metadata } from 'next';
import Link from 'next/link';
import { Plug, ChevronRight } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { businessSettingsService } from '@/services/businessSettingsService';
import { BusinessSettingsForm, DEFAULT_LOYALTY_CONFIG } from '@/components/admin/BusinessSettingsForm';
import { Card } from '@/components/ui/card';

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

      <Link href="/admin/settings/integrations">
        <Card className="flex items-center justify-between gap-3 p-5 transition-colors hover:bg-border/20">
          <div className="flex items-center gap-3">
            <Plug className="size-5 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-foreground">Integrations</p>
              <p className="text-caption text-muted-foreground">Daraja, WhatsApp, Jumia, Meta, and more — credentials and connection status.</p>
            </div>
          </div>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
        </Card>
      </Link>

      <BusinessSettingsForm
        initialValues={{
          name: business.name,
          currency: business.currency,
          whatsappPhoneNumberId: business.whatsappPhoneNumberId,
          countyCoverage: business.countyCoverage,
          adminWhatsappPhone: business.adminWhatsappPhone,
          whatsappCustomerNumber: business.whatsappCustomerNumber,
          status: business.status,
          loyaltyConfig: business.loyaltyConfig ?? DEFAULT_LOYALTY_CONFIG,
        }}
      />
    </div>
  );
}
