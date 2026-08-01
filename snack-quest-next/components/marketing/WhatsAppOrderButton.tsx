import { MessageCircle } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { buildWhatsAppOrderUrl } from '@/lib/whatsapp/orderLink';

/**
 * The site-wide "Order on WhatsApp" CTA — a real `wa.me` deep link
 * (`whatsappCustomerNumber` is null until Admin > Settings configures
 * it), never a fake "Buy now" button pointing at a checkout page that
 * doesn't exist. When the number isn't configured yet, this quietly
 * renders nothing rather than a broken/dead CTA.
 */
export function WhatsAppOrderButton({
  whatsappCustomerNumber,
  message,
  size = 'lg',
  variant = 'primary',
  className,
  children = 'Order on WhatsApp',
}: {
  whatsappCustomerNumber: string | null;
  message: string;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
  className?: string;
  children?: React.ReactNode;
}) {
  if (!whatsappCustomerNumber) {
    return null;
  }

  return (
    <Button asChild size={size} variant={variant} className={className}>
      <a href={buildWhatsAppOrderUrl(whatsappCustomerNumber, message)} target="_blank" rel="noopener noreferrer">
        <MessageCircle className="size-4" aria-hidden="true" />
        {children}
      </a>
    </Button>
  );
}
