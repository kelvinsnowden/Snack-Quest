import type { Metadata } from 'next';
import { MessageCircle, Package, Truck, Smartphone, CheckCircle2 } from 'lucide-react';
import { getCurrentBusiness } from '@/lib/business/currentBusiness';
import { Card } from '@/components/ui/card';
import { WhatsAppOrderButton } from '@/components/marketing/WhatsAppOrderButton';
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
    description: 'We\'ll show you our current boxes and prices. Reply with the one you want, or ask us anything first.',
  },
  {
    icon: Truck,
    title: 'Choose delivery or pickup',
    description:
      'Door delivery is available in Nairobi. Outside Nairobi, choose from real Jumia pickup stations near you — we\'ll confirm the fee for your area before you pay anything.',
  },
  {
    icon: Smartphone,
    title: 'Pay with M-Pesa',
    description:
      'Once you reply PAY, we send a real M-Pesa STK push straight to your phone. Nothing is charged before that — you\'re always in control of when payment happens.',
  },
  {
    icon: CheckCircle2,
    title: 'We pack and deliver',
    description:
      'Our warehouse team packs your box and books your courier. You can check in on WhatsApp any time for an update on where your order is.',
  },
];

export default async function HowItWorksPage() {
  const business = await getCurrentBusiness();

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-page-title font-bold tracking-tight text-foreground">How it works</h1>
      <p className="mt-3 max-w-2xl text-subtitle text-muted-foreground">
        No app, no cart, no account. Just a WhatsApp conversation from start to finish.
      </p>

      <div className="mt-12 flex flex-col gap-6">
        {STEPS.map((step, index) => (
          <Card key={step.title} className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start">
            <div className="flex items-center gap-3 sm:flex-col sm:items-center">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {index + 1}
              </span>
              <step.icon className="size-6 text-primary sm:hidden" aria-hidden="true" />
            </div>
            <div>
              <p className="text-card-title font-semibold text-foreground">{step.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-12">
        <WhatsAppOrderButton
          whatsappCustomerNumber={business?.whatsappCustomerNumber ?? null}
          message="Hi! I'd like to place an order."
        />
      </div>
    </div>
  );
}
