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
    'Reach Snack Quest on WhatsApp for orders, delivery updates, or questions.',
  path: '/contact',
});

export default async function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-page-title text-foreground font-bold tracking-tight">
        Contact us
      </h1>
      <p className="text-subtitle text-muted-foreground mt-3">
        We keep every conversation — orders, questions, and issues — in one
        place: WhatsApp.
      </p>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="flex flex-col gap-4 p-6">
          <MessageCircle className="text-primary size-8" aria-hidden="true" />
          <div>
            <p className="text-card-title text-foreground font-semibold">
              Message us on WhatsApp
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              The fastest way to reach us — for orders, delivery updates, or
              anything else.
            </p>
          </div>
          <WhatsAppOrderButton
            message="Hi! I have a question."
            className="mt-auto"
          >
            Chat with us
          </WhatsAppOrderButton>
        </Card>

        <Card className="flex flex-col gap-4 p-6">
          <HelpCircle className="text-primary size-8" aria-hidden="true" />
          <div>
            <p className="text-card-title text-foreground font-semibold">
              Have a quick question?
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              Check our FAQ first — it covers delivery, payment, and order
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

        <Card className="flex flex-col gap-4 p-6">
          <Share2 className="text-primary size-8" aria-hidden="true" />
          <div>
            <p className="text-card-title text-foreground font-semibold">
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
