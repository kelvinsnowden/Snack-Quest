import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { ArrowRight, MessageCircle, Truck, ShieldCheck, Smartphone } from 'lucide-react';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { getCurrentBusiness } from '@/lib/business/currentBusiness';
import { packageRepository } from '@/repositories/packageRepository';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WhatsAppOrderButton } from '@/components/marketing/WhatsAppOrderButton';
import { formatKes } from '@/lib/orders/format';

export const metadata: Metadata = {
  title: 'Snack boxes on WhatsApp, delivered across Kenya',
};

const VALUE_PROPS = [
  { icon: MessageCircle, title: 'Order on WhatsApp', description: 'No app to download — message us and we take it from there.' },
  { icon: Smartphone, title: 'Pay with M-Pesa', description: 'A real STK push to your phone once you confirm your box.' },
  { icon: Truck, title: 'Delivered to you', description: 'Door delivery in Nairobi, pickup stations across the country.' },
  { icon: ShieldCheck, title: 'Real snacks, real people', description: 'Curated boxes, packed and dispatched by our own warehouse team.' },
];

export default async function MarketingHomePage() {
  const businessId = getCurrentBusinessId();
  const [business, packages] = await Promise.all([getCurrentBusiness(), packageRepository.listActive(businessId)]);
  const featured = packages.slice(0, 3);
  const whatsappCustomerNumber = business?.whatsappCustomerNumber ?? null;

  return (
    <div className="flex flex-col">
      <section className="border-b border-border bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8 lg:py-24">
          <div>
            <p className="text-sm font-semibold tracking-wide text-primary uppercase">Snack boxes, made easy</p>
            <h1 className="mt-3 text-hero font-bold tracking-tight text-foreground">
              Order a snack box on WhatsApp. We handle the rest.
            </h1>
            <p className="mt-4 max-w-lg text-subtitle text-muted-foreground">
              Curated Kenyan and international snacks, delivered to your door in Nairobi or picked up nationwide —
              no app, no account, just a WhatsApp message.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <WhatsAppOrderButton whatsappCustomerNumber={whatsappCustomerNumber} message="Hi! I'd like to order a Snack Quest box." />
              <Button asChild variant="outline" size="lg">
                <Link href="/boxes">
                  See our boxes
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {VALUE_PROPS.map((prop) => (
              <Card key={prop.title} className="p-5">
                <prop.icon className="size-6 text-primary" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold text-foreground">{prop.title}</p>
                <p className="mt-1 text-caption text-muted-foreground">{prop.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {featured.length > 0 ? (
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-section-title font-bold tracking-tight text-foreground">Popular boxes</h2>
              <p className="mt-2 text-muted-foreground">A few of our best-selling snack boxes.</p>
            </div>
            <Link href="/boxes" className="hidden shrink-0 text-sm font-medium text-primary hover:underline sm:block">
              View all boxes
            </Link>
          </div>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map(({ id, data }) => (
              <Link key={id} href={`/boxes/${id}`} className="group block">
                <Card className="h-full overflow-hidden p-0 transition-shadow group-hover:shadow-md">
                  <div className="relative aspect-[4/3] w-full bg-border/40">
                    {data.imageUrl ? (
                      <Image src={data.imageUrl} alt={data.name} fill sizes="(min-width: 1024px) 33vw, 50vw" className="object-cover" unoptimized />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-4xl">🍿</div>
                    )}
                  </div>
                  <CardContent className="p-5">
                    <p className="text-card-title font-semibold text-foreground">{data.name}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{data.description}</p>
                    <p className="mt-3 text-lg font-semibold text-foreground">{formatKes(data.priceKes)}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
          <div className="mt-8 sm:hidden">
            <Button asChild variant="outline" className="w-full">
              <Link href="/boxes">View all boxes</Link>
            </Button>
          </div>
        </section>
      ) : null}

      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="text-section-title font-bold tracking-tight text-foreground">How it works</h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-3">
            {[
              { step: '1', title: 'Message us', description: 'Say hi on WhatsApp and pick a box that suits you.' },
              { step: '2', title: 'Confirm & pay', description: 'Choose delivery or pickup, then pay securely with M-Pesa.' },
              { step: '3', title: 'We deliver', description: 'Track your order until it lands at your door or pickup point.' },
            ].map((item) => (
              <div key={item.step}>
                <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {item.step}
                </span>
                <p className="mt-4 text-card-title font-semibold text-foreground">{item.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
          <Link href="/how-it-works" className="mt-8 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            Read the full walkthrough
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <Card className="flex flex-col items-start gap-4 bg-secondary/5 p-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-card-title font-semibold text-foreground">Love snacks? Earn by sharing them.</p>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Join the Snack Quest Creator Program — share your referral link and earn real commission on every order.
            </p>
          </div>
          <Button asChild size="lg" variant="secondary">
            <Link href="/creators">
              Learn about the creator program
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </Card>
      </section>
    </div>
  );
}
