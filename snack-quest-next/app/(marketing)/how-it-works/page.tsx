import type { Metadata } from 'next';
import {
  MessageCircle,
  Package,
  Truck,
  Smartphone,
  CheckCircle2,
  Compass,
} from 'lucide-react';
import { WhatsAppOrderButton } from '@/components/marketing/WhatsAppOrderButton';
import { PageShell } from '@/components/marketing/design/PageShell';
import { PageHero } from '@/components/marketing/design/PageHero';
import { SurfaceCard } from '@/components/marketing/design/SurfaceCard';
import { Reveal } from '@/components/marketing/design/Reveal';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'How it works',
  description:
    'The five real steps from your first WhatsApp message to delivery — pick a box, choose delivery or pickup, pay with M-Pesa, and get packed and delivered.',
  path: '/how-it-works',
});

const STEPS = [
  {
    icon: MessageCircle,
    title: 'Message us on WhatsApp',
    description:
      "Say hi, or tap a box straight from our WhatsApp catalog. There's no app to install and no account to create — everything happens in the chat you already have open.",
  },
  {
    icon: Package,
    title: 'Pick your box',
    description:
      "We'll show you our current boxes and prices. Reply with the one you want, or ask us anything first.",
  },
  {
    icon: Truck,
    title: 'Choose delivery or pickup',
    description:
      "Door delivery is available in Nairobi. Outside Nairobi, choose from real Jumia pickup stations near you — we'll confirm the fee for your area before you pay anything.",
  },
  {
    icon: Smartphone,
    title: 'Pay with M-Pesa',
    description:
      "Once you reply PAY, we send a real M-Pesa STK push straight to your phone. Nothing is charged before that — you're always in control of when payment happens.",
  },
  {
    icon: CheckCircle2,
    title: 'We pack and deliver',
    description:
      'Our warehouse team packs your box and books your courier. You can check in on WhatsApp any time for an update on where your order is.',
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
        subtitle="No app, no cart, no account. Just a WhatsApp conversation from start to finish."
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
        <div className="mt-14">
          <WhatsAppOrderButton message="Hi! I'd like to place an order." />
        </div>
      </Reveal>
    </PageShell>
  );
}
