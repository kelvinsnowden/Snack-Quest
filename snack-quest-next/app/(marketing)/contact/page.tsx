import Link from 'next/link';
import type { Metadata } from 'next';
import { MessageCircle, HelpCircle, Share2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { WhatsAppOrderButton } from '@/components/marketing/WhatsAppOrderButton';
import { SocialLinks } from '@/components/marketing/SocialLinks';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Contact us',
  description:
    'Reach Snack Quest on WhatsApp for delivery updates, order changes, or any question. Ordering itself happens on the website.',
  path: '/contact',
});

export default async function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-page-title">
        Contact us
      </h1>
      <p className="mt-2 text-sm text-muted-foreground sm:mt-3 sm:text-subtitle">
        Orders happen{' '}
        <Link href="/checkout" className="text-primary font-medium hover:underline">
          on the site
        </Link>
        , in about a minute. Everything else, a real person on WhatsApp.
      </p>

      <div className="mt-6 grid gap-4 sm:mt-10 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
        <Card className="flex flex-col gap-3 p-5 sm:gap-4 sm:p-6">
          <MessageCircle className="text-primary size-7 sm:size-8" aria-hidden="true" />
          <div>
            <p className="text-base font-semibold text-foreground sm:text-card-title">
              Message us on WhatsApp
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              Where your order is, changing an address, arranging a Bolt rider,
              or anything that went wrong. Real replies, no ticket system.
            </p>
          </div>
          <WhatsAppOrderButton
            message="Hi! I have a question."
            className="mt-auto"
          >
            Chat with us
          </WhatsAppOrderButton>
        </Card>

        <Card className="flex flex-col gap-3 p-5 sm:gap-4 sm:p-6">
          <HelpCircle className="text-primary size-7 sm:size-8" aria-hidden="true" />
          <div>
            <p className="text-base font-semibold text-foreground sm:text-card-title">
              Have a quick question?
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              Check our FAQ first, it covers delivery, payment, and order
              changes.
            </p>
          </div>
          <Link
            href="/faq"
            className="text-primary mt-auto text-sm font-medium hover:underline"
          >
            Read the FAQ
          </Link>
        </Card>

        <Card className="flex flex-col gap-3 p-5 sm:gap-4 sm:p-6">
          <Share2 className="text-primary size-7 sm:size-8" aria-hidden="true" />
          <div>
            <p className="text-base font-semibold text-foreground sm:text-card-title">
              Follow us
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              New boxes, behind-the-scenes, and creator shoutouts on
              Facebook, Instagram, and TikTok.
            </p>
          </div>
          <SocialLinks className="mt-auto flex items-center gap-4" />
        </Card>
      </div>
    </div>
  );
}
