import { MessageCircle } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { buildWhatsAppOrderUrl } from '@/lib/whatsapp/orderLink';
import { cn } from '@/lib/utils';
import { WHATSAPP_CTA_CLASS } from './design/ctaStyles';

/**
 * The site-wide "talk to a human" CTA — a real `wa.me` deep link to the
 * platform's centralized WhatsApp number (`lib/config/whatsapp.ts`).
 *
 * This is support and engagement, not commerce (§ Website Becomes the
 * Primary Commerce Channel): questions before buying, order updates,
 * address changes, arranging a Bolt rider, something arrived wrong.
 * Anything that is actually "buy this" uses `BuyNowButton` instead —
 * the default label here says so, so a caller that forgets to pass
 * `children` can't accidentally re-open a WhatsApp ordering path we no
 * longer run.
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
        <MessageCircle className="size-4" aria-hidden="true" />
        {children}
      </a>
    </Button>
  );
}
