import { Link2, Wallet, Trophy, Check } from 'lucide-react';
import { formatKes } from '@/lib/orders/format';
import {
  CREATOR_COMMISSION_KES,
  REFERRAL_DISCOUNT_KES,
} from '@/lib/creators/referralEconomics';
import { Reveal } from '../design/Reveal';

/**
 * The three things a creator actually gets, in the same premium card
 * treatment the home page gives its boxes (§ brand consistency pass):
 * gradient wash, soft accent bloom, hover lift, per-card accent colour.
 *
 * The claims are deliberately narrow — one permanent link, an instant
 * credit, a real leaderboard — because those are the three things this
 * platform genuinely does. No invented creator counts, no earnings
 * screenshots, nothing that would need a disclaimer.
 */
const PERKS = [
  {
    icon: Link2,
    kicker: 'Your link',
    title: 'One permanent link',
    body: 'Generated the moment you join and yours forever. Every click and every order through it is tracked automatically.',
    points: [
      `Your audience saves ${formatKes(REFERRAL_DISCOUNT_KES)}`,
      'The code applies itself at checkout',
      'Works in a bio, a story, or a DM',
    ],
    accent: {
      wash: 'from-background to-secondary/15',
      border: 'border-secondary/40',
      icon: 'text-secondary',
      bloom: 'bg-secondary/40',
      check: 'bg-secondary text-white',
    },
  },
  {
    icon: Wallet,
    kicker: 'Your money',
    title: `${formatKes(CREATOR_COMMISSION_KES)} an order, right away`,
    body: 'The commission lands in your balance the second the payment clears — not at the end of the month, and with nobody approving it first.',
    points: [
      'Same rate for every creator',
      'Withdraw straight to M-Pesa',
      'Every order itemised in your dashboard',
    ],
    accent: {
      wash: 'from-background to-primary/10',
      border: 'border-primary/30',
      icon: 'text-primary',
      bloom: 'bg-primary/40',
      check: 'bg-primary text-white',
    },
  },
  {
    icon: Trophy,
    kicker: 'Your standing',
    title: 'A leaderboard worth topping',
    body: 'See exactly where you rank against every other Snack Quest creator by orders driven and commission earned.',
    points: [
      'Updated as orders land',
      'Clicks and conversions side by side',
      'Campaigns you can opt into',
      'Top 3 each month get a free box',
    ],
    accent: {
      wash: 'from-background to-home-lime/20',
      border: 'border-foreground/5',
      icon: 'text-foreground',
      bloom: 'bg-home-lime/40',
      check: 'bg-home-lime text-foreground',
    },
  },
] as const;

export function CreatorPerks() {
  return (
    <section className="bg-white px-5 py-16 md:px-10 md:py-32">
      <Reveal>
        <div className="mx-auto max-w-xl text-center">
          <p className="text-caption text-secondary font-bold tracking-[0.3em] uppercase">
            What you get
          </p>
          <h2 className="font-display mt-4 text-4xl leading-[1.05] font-normal text-balance uppercase md:text-6xl">
            Everything you need.
          </h2>
          <p className="text-foreground/70 mx-auto mt-5 max-w-[576px] text-base md:text-lg">
            No application fee, no minimum audience, no exclusivity. Join, share, get paid.
          </p>
        </div>
      </Reveal>

      <div className="mx-auto mt-10 grid max-w-6xl gap-6 md:mt-20 md:grid-cols-3">
        {PERKS.map((perk, index) => (
          <Reveal key={perk.title} delayMs={index * 120}>
            <div
              className={`relative flex h-full flex-col overflow-hidden rounded-[28px] border bg-gradient-to-br p-6 transition-all duration-400 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-2 hover:shadow-[0_30px_80px_-30px_rgb(31_31_31/0.3)] md:p-9 ${perk.accent.wash} ${perk.accent.border}`}
            >
              <div
                aria-hidden="true"
                className={`absolute -top-16 -right-16 size-56 rounded-full blur-3xl ${perk.accent.bloom}`}
              />

              <div className="relative flex flex-1 flex-col">
                <div className="flex items-center gap-2">
                  <perk.icon
                    className={`size-5 ${perk.accent.icon}`}
                    strokeWidth={2.2}
                    aria-hidden="true"
                  />
                  <span className="text-caption text-foreground/60 font-bold tracking-wide uppercase">
                    {perk.kicker}
                  </span>
                </div>

                <h3 className="font-display mt-4 text-2xl leading-[1.1] font-normal uppercase md:mt-6 md:text-[2rem]">
                  {perk.title}
                </h3>
                <p className="text-small text-foreground/70 mt-3">{perk.body}</p>

                <ul className="mt-5 flex flex-1 flex-col gap-2.5 md:mt-7">
                  {perk.points.map((point) => (
                    <li
                      key={point}
                      className="text-small text-foreground/80 flex items-start gap-2.5"
                    >
                      <span
                        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${perk.accent.check}`}
                      >
                        <Check className="size-2.5" strokeWidth={3} aria-hidden="true" />
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
