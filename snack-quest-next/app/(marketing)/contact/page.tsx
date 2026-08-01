import Link from 'next/link';
import type { Metadata } from 'next';
import { MessageCircle, HelpCircle } from 'lucide-react';
import { getCurrentBusiness } from '@/lib/business/currentBusiness';
import { Card } from '@/components/ui/card';
import { WhatsAppOrderButton } from '@/components/marketing/WhatsAppOrderButton';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Contact us',
  description: 'Reach Snack Quest on WhatsApp for orders, delivery updates, or questions.',
  path: '/contact',
});

export default async function ContactPage() {
  const business = await getCurrentBusiness();
  const whatsappCustomerNumber = business?.whatsappCustomerNumber ?? null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-page-title font-bold tracking-tight text-foreground">Contact us</h1>
      <p className="mt-3 text-subtitle text-muted-foreground">
        We keep every conversation — orders, questions, and issues — in one place: WhatsApp.
      </p>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <Card className="flex flex-col gap-4 p-6">
          <MessageCircle className="size-8 text-primary" aria-hidden="true" />
          <div>
            <p className="text-card-title font-semibold text-foreground">Message us on WhatsApp</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The fastest way to reach us — for orders, delivery updates, or anything else.
            </p>
          </div>
          {whatsappCustomerNumber ? (
            <WhatsAppOrderButton whatsappCustomerNumber={whatsappCustomerNumber} message="Hi! I have a question." className="mt-auto">
              Chat with us
            </WhatsAppOrderButton>
          ) : (
            <p className="mt-auto text-sm text-muted-foreground">Our WhatsApp line isn&apos;t set up yet — check back soon.</p>
          )}
        </Card>

        <Card className="flex flex-col gap-4 p-6">
          <HelpCircle className="size-8 text-primary" aria-hidden="true" />
          <div>
            <p className="text-card-title font-semibold text-foreground">Have a quick question?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Check our FAQ first — it covers delivery, payment, and order changes.
            </p>
          </div>
          <Link href="/faq" className="mt-auto text-sm font-medium text-primary hover:underline">
            Read the FAQ
          </Link>
        </Card>
      </div>
    </div>
  );
}
