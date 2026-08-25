'use client';

import { buildWhatsAppOrderUrl } from '@/lib/whatsapp/orderLink';
import { trackEvent } from '@/lib/analytics/trackEvent';
import { FUNNEL_EVENTS, type WhatsAppOrderSource } from '@/lib/analytics/funnelEvents';
import { cn } from '@/lib/utils';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';

/**
 * "Order on WhatsApp" — a second way to actually buy (§ order on
 * WhatsApp), for customers who would rather finish in a thread than a
 * form.
 *
 * Distinct from `WhatsAppOrderButton`, which is the support CTA
 * ("ask a question", "chase a delivery"). This one carries purchase
 * intent, so it fires `whatsapp_order_started` and names the surface
 * it was pressed on. Without that the channel the owner believes
 * converts best would be the only one in the funnel with no numbers
 * at all, and "WhatsApp works better" would stay an untestable belief.
 *
 * Styled as a secondary next to M-Pesa rather than as a rival primary.
 * Two glowing buttons side by side is a choice a customer has to stop
 * and make, and a checkout is the worst place to introduce one; this
 * needs to read as the escape hatch for whoever wants it and stay
 * quiet for everyone else. The design system's "never two primaries in
 * one section" rule says the same thing.
 *
 * Purple, not WhatsApp's green — the same call `WHATSAPP_CTA_CLASS`
 * already documents. Orange is the buy button everywhere on this site,
 * so borrowing a third colour for a third kind of buying would make
 * the page harder to read, not clearer. Soft-filled rather than the
 * support CTA's glowing pill, because that one is competing for
 * attention and this one is answering a question the customer has
 * already asked themselves.
 */
export function WhatsAppCheckoutButton({
  message,
  source,
  packageId,
  className,
  children = 'Order on WhatsApp',
}: {
  message: string;
  source: WhatsAppOrderSource;
  /** Recorded with the event when a specific box is being bought. */
  packageId?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <a
      href={buildWhatsAppOrderUrl(message)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        // Fire-and-forget by construction, and the link is a plain
        // anchor, so analytics can never stand between a customer and
        // the conversation they were trying to start.
        trackEvent(FUNNEL_EVENTS.whatsappOrderStarted, {
          source,
          ...(packageId ? { packageId } : {}),
        });
      }}
      className={cn(
        'border-secondary/35 bg-secondary/10 text-secondary hover:bg-secondary/20 focus-visible:ring-secondary inline-flex items-center justify-center gap-2 rounded-full border px-5 py-3 text-base font-semibold transition duration-150 ease-out focus-visible:ring-2 focus-visible:outline-none',
        className,
      )}
    >
      <WhatsAppIcon className="size-5" />
      {children}
    </a>
  );
}
