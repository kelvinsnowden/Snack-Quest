import Link from 'next/link';
import { ArrowUpRight, Sparkles } from 'lucide-react';

/**
 * The portal's hero (§ Creator Portal premium rebuild, wallet
 * pattern).
 *
 * Modelled on how consumer finance apps open: one saturated card
 * carrying the single number the user came for, everything else
 * subordinate to it. A creator opens this portal to answer "how much
 * have I made" — so that figure gets the boldest surface on the
 * screen rather than sharing a neutral row with click counts.
 *
 * Deliberately the *only* saturated surface in the portal. It reads as
 * a focal point because the rest of the UI is calm; make a second card
 * this loud and both stop working.
 *
 * Purple rather than the brand orange: orange is the storefront's
 * "buy" colour and reusing it for a balance would collide with the CTA
 * language customers already learn. The lime accent marks the
 * lifetime figure as positive without adding a second heavy hue.
 */
export function BalanceCard({
  availableKes,
  pendingKes,
  lifetimeKes,
  referralCode,
  canWithdraw,
}: {
  availableKes: number;
  pendingKes: number;
  lifetimeKes: number;
  referralCode: string;
  canWithdraw: boolean;
}) {
  const format = (n: number) => `KES ${n.toLocaleString()}`;

  return (
    <section
      aria-labelledby="balance-heading"
      className="from-secondary relative overflow-hidden rounded-2xl bg-gradient-to-br to-[#3d1f8f] p-6 text-white shadow-[0_20px_60px_-24px_rgb(108_59_255/0.55)] md:p-8"
    >
      {/* One soft highlight, not a field of blobs — it gives the flat
          gradient a light source so the card reads as a surface. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-white/10 blur-3xl"
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="balance-heading"
              className="text-caption font-medium tracking-wide text-white/70 uppercase"
            >
              Available balance
            </h2>
            <p className="mt-2 text-[2.5rem] leading-none font-semibold tracking-tight tabular-nums md:text-[3rem]">
              {format(availableKes)}
            </p>
          </div>
          <span className="bg-home-lime text-foreground inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold">
            <Sparkles className="size-3.5" aria-hidden="true" />
            {referralCode}
          </span>
        </div>

        <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
          <div>
            <dt className="text-caption font-medium tracking-wide text-white/60 uppercase">
              Pending
            </dt>
            <dd className="mt-1 font-semibold tabular-nums">
              {format(pendingKes)}
            </dd>
          </div>
          <div>
            <dt className="text-caption font-medium tracking-wide text-white/60 uppercase">
              Lifetime earned
            </dt>
            <dd className="text-home-lime mt-1 font-semibold tabular-nums">
              {format(lifetimeKes)}
            </dd>
          </div>
        </dl>

        {canWithdraw ? (
          <Link
            href="/creator/withdrawals"
            className="text-secondary mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-white px-6 font-semibold transition-transform duration-150 ease-out hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent focus-visible:outline-none active:translate-y-0"
          >
            Withdraw
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        ) : (
          <p className="mt-8 text-sm text-white/70">
            Withdrawals unlock once your account is approved.
          </p>
        )}
      </div>
    </section>
  );
}
