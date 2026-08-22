import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Plug,
  ChevronRight,
  ToggleLeft,
  Image as ImageIcon,
} from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { businessSettingsService } from '@/services/businessSettingsService';
import {
  BusinessSettingsForm,
  DEFAULT_LOYALTY_CONFIG,
} from '@/components/admin/BusinessSettingsForm';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Settings' };

export default async function AdminSettingsPage() {
  const session = await requireStaffSession();
  const business = await businessSettingsService.getSettings(
    session.businessId,
  );

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl md:text-3xl text-foreground font-bold tracking-tight">
          Settings
        </h1>
        <p className="hidden sm:block text-muted-foreground mt-1 text-sm">
          This business&apos;s own configuration — name, currency, WhatsApp
          routing, and coverage.
        </p>
      </div>

      <Link href="/admin/settings/integrations">
        <Card className="hover:bg-border/20 flex items-center justify-between gap-3 p-5 transition-colors">
          <div className="flex items-center gap-3">
            <Plug className="text-primary size-5" aria-hidden="true" />
            <div>
              <p className="text-foreground text-sm font-semibold">
                Integrations
              </p>
              <p className="text-caption text-muted-foreground">
                Daraja, WhatsApp, Meta, SMS, and more — credentials and
                connection status.
              </p>
            </div>
          </div>
          <ChevronRight
            className="text-muted-foreground size-4"
            aria-hidden="true"
          />
        </Card>
      </Link>

      <Link href="/admin/settings/feature-flags">
        <Card className="hover:bg-border/20 flex items-center justify-between gap-3 p-5 transition-colors">
          <div className="flex items-center gap-3">
            <ToggleLeft className="text-primary size-5" aria-hidden="true" />
            <div>
              <p className="text-foreground text-sm font-semibold">
                Feature flags
              </p>
              <p className="text-caption text-muted-foreground">
                Turn platform features on or off — takes effect immediately.
              </p>
            </div>
          </div>
          <ChevronRight
            className="text-muted-foreground size-4"
            aria-hidden="true"
          />
        </Card>
      </Link>

      <Link href="/admin/settings/homepage">
        <Card className="hover:bg-border/20 flex items-center justify-between gap-3 p-5 transition-colors">
          <div className="flex items-center gap-3">
            <ImageIcon className="text-primary size-5" aria-hidden="true" />
            <div>
              <p className="text-foreground text-sm font-semibold">
                Homepage content
              </p>
              <p className="text-caption text-muted-foreground">
                The founder portrait and snack flat-lay photos shown on the
                homepage.
              </p>
            </div>
          </div>
          <ChevronRight
            className="text-muted-foreground size-4"
            aria-hidden="true"
          />
        </Card>
      </Link>

      <BusinessSettingsForm
        initialValues={{
          name: business.name,
          currency: business.currency,
          whatsappPhoneNumberId: business.whatsappPhoneNumberId,
          countyCoverage: business.countyCoverage,
          adminWhatsappPhone: business.adminWhatsappPhone,
          status: business.status,
          loyaltyConfig: business.loyaltyConfig ?? DEFAULT_LOYALTY_CONFIG,
        }}
      />
    </div>
  );
}
