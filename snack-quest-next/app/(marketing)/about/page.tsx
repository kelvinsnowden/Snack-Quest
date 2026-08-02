import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Our story',
  description: 'Why we built Snack Quest as a WhatsApp-first snack box service, and how our Creator Program works.',
  path: '/about',
});

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-page-title font-bold tracking-tight text-foreground">Our story</h1>

      <div className="mt-8 flex flex-col gap-6 text-subtitle leading-relaxed text-muted-foreground">
        <p>
          Snack Quest started with a simple frustration: ordering snacks online in Kenya meant downloading yet
          another app, creating yet another account, and hoping the checkout page didn&apos;t time out halfway
          through. Meanwhile, everyone we knew was already living on WhatsApp.
        </p>
        <p>
          So we built the thing we actually wanted — a way to order a real, curated box of snacks the same way
          you&apos;d message a friend. No app. No password to forget. Just a chat, a box, and M-Pesa.
        </p>
        <p>
          Every box we send out is packed by our own warehouse team, from suppliers we work with directly — not
          drop-shipped, not outsourced. When something goes wrong, a real person on our team sorts it out, on the
          same WhatsApp thread you ordered from.
        </p>
        <p>
          As we&apos;ve grown, we&apos;ve leaned on the people who already talk about snacks online — our{' '}
          <Link href="/creators" className="font-medium text-primary hover:underline">
            Creator Program
          </Link>{' '}
          lets anyone with an audience share their own referral link and earn real commission when their followers
          order. It&apos;s the same principle as everything else here: cut out the middleman, keep it simple, and
          make sure the people involved actually get paid.
        </p>
      </div>

      <Card className="mt-12 flex flex-col items-start gap-4 bg-secondary/5 p-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-card-title font-semibold text-foreground">Curious how an order actually works?</p>
          <p className="mt-1 text-sm text-muted-foreground">See the real steps, from first message to delivery.</p>
        </div>
        <Button asChild size="lg">
          <Link href="/how-it-works">
            How it works
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </Card>
    </div>
  );
}
