import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/marketing/design/PageShell';
import { PageHero } from '@/components/marketing/design/PageHero';
import { SurfaceCard } from '@/components/marketing/design/SurfaceCard';
import { Reveal } from '@/components/marketing/design/Reveal';
import { PRIMARY_CTA_CLASS } from '@/components/marketing/design/ctaStyles';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Our story',
  description:
    'Why we built Snack Quest as a WhatsApp-first snack box service, and how our Creator Program works.',
  path: '/about',
});

const PARAGRAPHS = [
  <>
    Snack Quest started with a simple frustration: ordering snacks online in
    Kenya meant downloading yet another app, creating yet another account, and
    hoping the checkout page didn&apos;t time out halfway through. Meanwhile,
    everyone we knew was already living on WhatsApp.
  </>,
  <>
    So we built the thing we actually wanted: a way to order a real, curated
    box of snacks the same way you&apos;d message a friend. No app. No password
    to forget. Just a chat, a box, and M-Pesa.
  </>,
  <>
    Every box we send out is packed by our own warehouse team, from suppliers we
    work with directly, not drop-shipped, not outsourced. When something goes
    wrong, a real person on our team sorts it out, on the same WhatsApp thread
    you ordered from.
  </>,
  <>
    As we&apos;ve grown, we&apos;ve leaned on the people who already talk about
    snacks online, our{' '}
    <Link
      href="/creators"
      className="text-primary focus-visible:ring-primary focus-visible:ring-offset-background font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      Creator Program
    </Link>{' '}
    lets anyone with an audience share their own referral link and earn real
    commission when their followers order. It&apos;s the same principle as
    everything else here: cut out the middleman, keep it simple, and make sure
    the people involved actually get paid.
  </>,
];

export default function AboutPage() {
  return (
    <PageShell width="narrow">
      <PageHero
        eyebrow="Since 2026 · Nairobi"
        eyebrowIcon={Sparkles}
        title="Our"
        accent="story."
      />

      <div className="mt-12 flex flex-col gap-6">
        {PARAGRAPHS.map((paragraph, index) => (
          <Reveal key={index} delayMs={index * 80}>
            <p className="text-subtitle text-foreground/75 leading-relaxed">
              {paragraph}
            </p>
          </Reveal>
        ))}
      </div>

      <Reveal delayMs={120}>
        <SurfaceCard className="mt-14 flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-card-title text-foreground font-semibold">
              Curious how an order actually works?
            </h2>
            <p className="text-body text-muted-foreground mt-1">
              See the real steps, from first message to delivery.
            </p>
          </div>
          <Button asChild size="lg" className={PRIMARY_CTA_CLASS}>
            <Link href="/how-it-works">
              How it works
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </SurfaceCard>
      </Reveal>
    </PageShell>
  );
}
