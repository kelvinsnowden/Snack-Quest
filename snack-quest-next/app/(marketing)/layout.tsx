import { getCurrentBusiness } from '@/lib/business/currentBusiness';
import { MarketingHeader } from '@/components/marketing/MarketingHeader';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';

/**
 * Every marketing page reads live data (active boxes, the business's
 * WhatsApp number) — stock and contact details can change at any
 * time, so this is never a candidate for static prerendering the way
 * a truly static page would be. Forced here, once, so it applies to
 * every page under this layout without repeating it per page.
 */
export const dynamic = 'force-dynamic';

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const business = await getCurrentBusiness();
  const businessName = business?.name ?? 'Snack Quest';

  return (
    <div className="flex min-h-full flex-col">
      <MarketingHeader businessName={businessName} whatsappCustomerNumber={business?.whatsappCustomerNumber ?? null} />
      <main className="flex-1">{children}</main>
      <MarketingFooter businessName={businessName} />
    </div>
  );
}
