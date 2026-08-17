import { FileCheck2, ShieldCheck, Link2, Megaphone, Coins, Wallet } from 'lucide-react';
import { formatKes } from '@/lib/orders/format';
import { CREATOR_COMMISSION_KES } from '@/lib/creators/referralEconomics';
import { MIN_WITHDRAWAL_KES } from '@/lib/withdrawals/rules';
import { Reveal } from '../design/Reveal';

/**
 * The creator's real six steps, in the same dark "expedition" treatment
 * the home page uses for the customer's four steps (§ brand consistency
 * pass) — same radial jungle gradient, same lime kicker, same drifting
 * fireflies, same numbered checkpoints.
 *
 * § Creator Program CRO pass rewrote this from four steps to the
 * actual flow: the old copy ("Sign up... two minutes and you're in")
 * skipped approval entirely, which is exactly the false "instant"
 * impression the audit exists to remove. Every step here matches a
 * real system transition — `status: 'pending'` at registration
 * (`CreatorAuthService.register`), `'active'` only after an admin
 * approves (`creatorAdminService.updateStatus`), the "usually under a
 * working day" line straight from the dashboard's own
 * `lib/creator/nextStep.ts` copy so this page never claims a faster or
 * slower SLA than the product itself states.
 *
 * Emoji step icons are gone too, replaced with real lucide glyphs —
 * generic concepts (apply, approve, link, share, earn, withdraw), not
 * a brand mark, so lucide is the right tool here (unlike WhatsApp or
 * M-Pesa elsewhere on this page, which need real brand icons).
 */
const STEPS = [
  {
    icon: FileCheck2,
    title: 'Apply',
    body: 'Submit your creator application — name, email, a password. Two minutes.',
  },
  {
    icon: ShieldCheck,
    title: 'Get approved',
    body: 'We review every application. Approval usually takes under a working day.',
  },
  {
    icon: Link2,
    title: 'Get your link',
    body: 'Your permanent referral link is waiting in your dashboard the moment you’re approved.',
  },
  {
    icon: Megaphone,
    title: 'Share it',
    body: 'Drop it wherever your audience already hangs out — bio, story, WhatsApp, a DM.',
  },
  {
    icon: Coins,
    title: 'They order, you earn',
    body: `Their discount applies at checkout. Your ${formatKes(CREATOR_COMMISSION_KES)} lands in your balance the moment they pay.`,
  },
  {
    icon: Wallet,
    title: 'Withdraw to M-Pesa',
    body: `Request a payout from your dashboard whenever you want, once your balance reaches ${formatKes(MIN_WITHDRAWAL_KES)}.`,
  },
];

const FIREFLIES = Array.from({ length: 12 }, (_, i) => ({
  left: (i * 47) % 100,
  top: (i * 41) % 100,
  duration: 4 + (i % 5),
  delay: i % 4,
}));

export function CreatorRoute() {
  return (
    <section
      className="relative overflow-hidden px-5 py-16 md:px-10 md:py-32"
      style={{
        background:
          'radial-gradient(ellipse at top, oklch(0.34 0.13 300) 0%, oklch(0.22 0.11 297) 55%, oklch(0.15 0.08 295) 100%)',
      }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/10 to-transparent blur-2xl" />
        <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/40 to-transparent" />
        {FIREFLIES.map((firefly, i) => (
          <span
            key={i}
            className="bg-home-lime absolute size-1.5 rounded-full opacity-75 shadow-[0_0_12px_4px_rgb(200_255_0/0.7)]"
            style={{
              left: `${firefly.left}%`,
              top: `${firefly.top}%`,
              animation: `floatSlow ${firefly.duration}s ease-in-out infinite`,
              animationDelay: `${firefly.delay}s`,
            }}
          />
        ))}
      </div>

      <div className="relative mx-auto max-w-2xl text-center">
        <p className="text-caption text-home-lime font-bold tracking-[0.3em] uppercase">
          How it works
        </p>
        <h2 className="font-display mt-4 text-4xl leading-[1.05] font-normal text-balance text-white uppercase md:text-6xl">
          From your post to your <span className="text-home-lime">M-Pesa.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-[512px] text-base text-white/70 md:text-lg">
          Apply, get approved, then share. The longest step is usually choosing what to say about
          us.
        </p>
      </div>

      <ol className="relative mx-auto mt-10 grid max-w-5xl gap-6 md:mt-16 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <Reveal key={step.title} as="li" delayMs={index * 90}>
            <div className="flex h-full flex-col items-center gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-sm md:items-start md:text-left">
              <div className="relative">
                <span className="border-home-lime bg-foreground flex size-14 items-center justify-center rounded-full border-2 shadow-[0_0_40px_-5px_rgb(200_255_0/0.7)]">
                  <step.icon className="text-home-lime size-6" strokeWidth={2.2} aria-hidden="true" />
                </span>
                <span className="bg-secondary text-caption absolute -right-1.5 -bottom-1.5 flex size-6 items-center justify-center rounded-full font-bold text-white">
                  {index + 1}
                </span>
              </div>
              <div>
                <h3 className="font-display text-xl leading-[1.1] font-normal text-white uppercase md:text-2xl">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm text-white/70">{step.body}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}
