import type { Metadata } from 'next';
import {
  Package,
  Truck,
  Smartphone,
  CheckCircle2,
  Compass,
  MessageCircle,
} from 'lucide-react';
import { BuyNowButton } from '@/components/marketing/BuyNowButton';
import { WhatsAppOrderButton } from '@/components/marketing/WhatsAppOrderButton';
import { PageShell } from '@/components/marketing/design/PageShell';
import { PageHero } from '@/components/marketing/design/PageHero';
import { SurfaceCard } from '@/components/marketing/design/SurfaceCard';
import { Reveal } from '@/components/marketing/design/Reveal';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'How it works',
  description:
    'Four steps from box to doorstep: pick a box, choose pickup or Nairobi door delivery, pay with M-Pesa, and we pack and ship. No app, no account.',
  path: '/how-it-works',
});

/**
 * The real, current customer journey (§ Website Becomes the Primary
 * Commerce Channel). Ordering happens here, on the website — the
 * WhatsApp steps this page used to describe ("reply PAY", "tap a box
 * from our catalog") no longer exist for a customer, and describing
 * them would send people to a thread expecting to buy something.
 * WhatsApp is where we answer questions and sort problems out, which
 * is what the support note below the steps now says.
 */
const STEPS = [
  {
    icon: Package,
    title: 'Pick your box',
    description:
      "Browse the current boxes and prices, then tap Buy now. There's no app to install and no account to create, and you can change your mind right up until you pay.",
  },
  {
    icon: Truck,
    title: 'Tell us where to send it',
    description:
      "Choose a Jumia pickup station anywhere in Kenya and the fee for that station is added to your total automatically, before you pay. In Nairobi you can pick door delivery instead: the box itself is paid for here, and we arrange the Bolt rider with you on WhatsApp afterwards.",
  },
  {
    icon: Smartphone,
    title: 'Pay with M-Pesa',
    description:
      "Check your total, then tap pay and approve the M-Pesa prompt on your phone. Nothing is charged before that. If you have a creator's referral code, it comes off the total here.",
  },
  {
    icon: CheckCircle2,
    title: 'We pack and deliver',
    description:
      'Payment confirms on the page by itself, and your order reference appears straight away. Our team hand-packs your box within 24 hours and books your courier, and we send the details to your WhatsApp too.',
  },
];

export default async function HowItWorksPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="The route"
        eyebrowIcon={Compass}
        title="How it"
        accent="works."
        subtitle="No app, no account, no waiting for a reply. Order in about a minute and pay with M-Pesa."
      />

      <ol className="mt-14 flex flex-col gap-6">
        {STEPS.map((step, index) => (
          <Reveal key={step.title} as="li" delayMs={index * 80}>
            <SurfaceCard className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="flex items-center gap-3 sm:flex-col sm:gap-2">
                <span className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-full text-base font-bold">
                  {index + 1}
                </span>
                <step.icon
                  className="text-secondary size-6 shrink-0"
                  aria-hidden="true"
                />
              </div>
              <div>
                <h2 className="text-card-title text-foreground font-semibold">
                  {step.title}
                </h2>
                <p className="text-body text-muted-foreground mt-2">
                  {step.description}
                </p>
              </div>
            </SurfaceCard>
          </Reveal>
        ))}
      </ol>

      <Reveal delayMs={120}>
        <SurfaceCard className="mt-14 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <MessageCircle
              className="text-secondary mt-0.5 size-6 shrink-0"
              aria-hidden="true"
            />
            <div>
              <h2 className="text-card-title text-foreground font-semibold">
                And if you need a human?
              </h2>
              <p className="text-body text-muted-foreground mt-2">
                That&apos;s what our WhatsApp is for. Ask about a box before you
                buy, chase an order, change an address, arrange your Bolt rider,
                or tell us something arrived wrong. Same number, same people, and
                you never need it just to place an order.
              </p>
            </div>
          </div>
          <WhatsAppOrderButton
            message="Hi! I have a question."
           
            size="md"
            className="self-start"
          >
            Chat with us on WhatsApp
          </WhatsAppOrderButton>
        </SurfaceCard>
      </Reveal>

      <Reveal delayMs={180}>
        <div className="mt-10">
          <BuyNowButton>Start your quest</BuyNowButton>
        </div>
      </Reveal>
    </PageShell>
  );
}
