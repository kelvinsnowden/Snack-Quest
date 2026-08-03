import { MessageCircle } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { buildWhatsAppOrderUrl } from '@/lib/whatsapp/orderLink';

/** The site-wide "Order on WhatsApp" CTA — a real `wa.me` deep link to the platform's centralized WhatsApp number (`lib/config/whatsapp.ts`), never a fake "Buy now" button pointing at a checkout page that doesn't exist. */
export function WhatsAppOrderButton({
  message,
  size = 'lg',
  variant = 'primary',
  className,
  children = 'Order on WhatsApp',
}: {
  message: string;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Button asChild size={size} variant={variant} className={className}>
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
