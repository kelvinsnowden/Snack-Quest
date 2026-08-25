import { Button, type ButtonProps } from '@/components/ui/button';
import { buildWhatsAppOrderUrl } from '@/lib/whatsapp/orderLink';
import { cn } from '@/lib/utils';
import { WHATSAPP_CTA_CLASS } from './design/ctaStyles';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';

/**
 * The site-wide "talk to a human" CTA — a real `wa.me` deep link to the
 * platform's centralized WhatsApp number (`lib/config/whatsapp.ts`).
 *
 * This is the *support* CTA: questions before buying, order updates,
 * address changes, chasing a delivery, something arrived wrong. It
 * used to say WhatsApp was "not commerce" full stop, which is no
 * longer true — ordering in a thread is a real path again (§ order on
 * WhatsApp), it just belongs to `WhatsAppCheckoutButton`, which fires
 * `whatsapp_order_started` and carries the box being bought.
 *
 * The split is worth keeping rather than merging the two. A support
 * click and a purchase click are different events, and one component
 * doing both would record them as the same one — which is how a
 * channel ends up with numbers that cannot answer "does WhatsApp
 * actually sell anything".
 *
 * There is deliberately no `variant` prop. Every instance carries the
 * one branded treatment (`WHATSAPP_CTA_CLASS`) — call sites used to
 * pass `variant="outline"` and the result was a grey hairline button
 * sitting under a glowing orange one, which made talking to us look
 * like the afterthought option rather than the friendly one.
 */
export function WhatsAppOrderButton({
  message,
  size = 'lg',
  className,
  children = 'Chat on WhatsApp',
}: {
  message: string;
  size?: ButtonProps['size'];
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Button asChild size={size} className={cn(WHATSAPP_CTA_CLASS, className)}>
      <a
        href={buildWhatsAppOrderUrl(message)}
        target="_blank"
        rel="noopener noreferrer"
      >
        <WhatsAppIcon className="size-4" />
        {children}
      </a>
    </Button>
  );
}
