import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';

/**
 * The site-wide purchase CTA (§ Website Becomes the Primary Commerce
 * Channel). Replaces `WhatsAppOrderButton` everywhere the intent is
 * "buy this" — the website is now where an order is placed, priced and
 * paid for, and WhatsApp is support and engagement.
 *
 * `WhatsAppOrderButton` deliberately stays for the CTAs that really are
 * conversations: asking a question, chasing an order, arranging a Bolt
 * rider. Those were never purchases pretending to be chats.
 *
 * Links to `/checkout?box=<id>` when a specific box is being sold, or
 * bare `/checkout` when the CTA is generic — the checkout page
 * pre-selects from that parameter and falls back to the first active
 * box, so neither form can land the customer on an empty page.
 */
export function BuyNowButton({
  packageId,
  size = 'lg',
  variant = 'primary',
  className,
  onClick,
  children = 'Buy now',
}: {
  packageId?: string;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
  className?: string;
  /** For callers that need to react to the navigation — e.g. the header closing its mobile menu, which a client-side route change won't do on its own. */
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  const href = packageId ? `/checkout?box=${encodeURIComponent(packageId)}` : '/checkout';

  return (
    <Button asChild size={size} variant={variant} className={className}>
      <Link href={href} onClick={onClick}>
        <ShoppingBag className="size-4" aria-hidden="true" />
        {children}
      </Link>
    </Button>
  );
}
