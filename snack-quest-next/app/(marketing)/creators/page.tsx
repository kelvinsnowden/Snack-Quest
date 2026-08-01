import Link from 'next/link';
import type { Metadata } from 'next';
import { Link2, Wallet, Trophy, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Creator Program',
  description: 'Join the Snack Quest Creator Program — share your referral link and earn real, instant commission on every order.',
  path: '/creators',
});

const FEATURES = [
  {
    icon: Link2,
    title: 'Your own referral link',
    description: 'Every creator gets a unique link. Share it however you like — every real click and order is tracked automatically.',
  },
  {
    icon: Wallet,
    title: 'Real, instant commission',
    description: 'When someone orders through your link, your commission is credited to your balance right away — not weeks later.',
  },
  {
    icon: Trophy,
    title: 'A real leaderboard',
    description: 'See how you rank against other creators by conversions and commission earned, right from your dashboard.',
  },
];

export default function CreatorsPage() {
  return (
    <div className="flex flex-col">
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-4xl animate-fade-in px-4 py-16 text-center sm:px-6 lg:px-8">
          <p className="text-sm font-semibold tracking-wide text-primary uppercase">Creator Program</p>
          <h1 className="mt-3 text-hero font-bold tracking-tight text-foreground">Earn by sharing snacks you already love</h1>
          <p className="mx-auto mt-4 max-w-2xl text-subtitle text-muted-foreground">
            If you already talk about food, snacks, or good deals online, turn that into real income — no minimum
            following, no upfront cost.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/creator/register">
                Join the Creator Program
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/creator/login">Already a creator? Sign in</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-6 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="p-6">
              <feature.icon className="size-6 text-primary" aria-hidden="true" />
              <p className="mt-4 text-card-title font-semibold text-foreground">{feature.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{feature.description}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="text-section-title font-bold tracking-tight text-foreground">How it works</h2>
          <ol className="mt-8 flex flex-col gap-6">
            {[
              'Apply in a few minutes with your name, niche, and social handles.',
              'Get your own referral link and start sharing it with your audience.',
              'Earn commission the moment someone orders through your link.',
              'Withdraw your balance to M-Pesa whenever you\'re ready.',
            ].map((step, index) => (
              <li key={step} className="flex items-start gap-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {index + 1}
                </span>
                <p className="text-sm text-foreground">{step}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10">
            <Button asChild size="lg">
              <Link href="/creator/register">
                Join the Creator Program
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
