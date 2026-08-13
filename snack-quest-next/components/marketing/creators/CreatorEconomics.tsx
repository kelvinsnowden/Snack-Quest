import { Coins, Tag, Users } from 'lucide-react';
import { formatKes } from '@/lib/orders/format';
import { CREATOR_COMMISSION_KES, REFERRAL_DISCOUNT_KES } from '@/lib/creators/referralEconomics';
import { Reveal } from '../design/Reveal';

/**
 * The win-win, made impossible to misread (§ founder story integration).
 * Three cards, one number each, no fine print — because the single
 * biggest source of confusion in an affiliate program is someone
 * conflating "what the creator earns" with "what the customer saves".
 * Both figures come from `referralEconomics.ts`, never typed by hand.
 */
const ROWS = [
  {
    icon: Coins,
    kicker: 'Creator',
    amount: () => formatKes(CREATOR_COMMISSION_KES),
    label: 'per successful sale',
    accent: 'border-secondary/40 from-background to-secondary/15 text-secondary',
  },
  {
    icon: Tag,
    kicker: 'Customer',
    amount: () => formatKes(REFERRAL_DISCOUNT_KES),
    label: 'off, when they buy through your link',
    accent: 'border-primary/30 from-background to-primary/10 text-primary',
  },
  {
    icon: Users,
    kicker: 'Snack Quest',
    amount: () => 'A new customer',
    label: 'and one more person who trusts the brand',
    accent: 'border-foreground/5 from-background to-home-lime/20 text-foreground',
  },
] as const;

export function CreatorEconomics() {
  return (
    <section className="bg-white px-5 py-16 md:px-10 md:py-32">
      <Reveal>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-4xl leading-[1.05] font-normal text-balance uppercase md:text-6xl">
            Everyone wins — <span className="text-secondary">here&apos;s exactly how.</span>
          </h2>
        </div>
      </Reveal>

      <div className="mx-auto mt-10 grid max-w-5xl gap-5 md:mt-16 md:grid-cols-3">
        {ROWS.map((row, index) => (
          <Reveal key={row.kicker} delayMs={index * 120}>
            <div
              className={`flex h-full flex-col items-center gap-2 rounded-[24px] border bg-gradient-to-br p-7 text-center md:p-9 ${row.accent}`}
            >
              <row.icon className="size-6" strokeWidth={2.2} aria-hidden="true" />
              <p className="text-caption font-bold tracking-[0.25em] text-foreground/60 uppercase">{row.kicker}</p>
              <p className="font-display text-4xl leading-[1] font-normal uppercase md:text-5xl">{row.amount()}</p>
              <p className="text-small text-foreground/70">{row.label}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
