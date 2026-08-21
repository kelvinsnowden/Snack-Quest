'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, Clock, Copy, Eye, EyeOff, TrendingUp } from 'lucide-react';

/**
 * The portal's hero (§ Creator Portal premium rebuild; resized in the
 * mobile polish pass).
 *
 * The change that matters here is that the card is now **sized to its
 * state**. It used to render the same tall layout for everyone, which
 * meant a creator who had not earned anything yet was given roughly 38%
 * of their phone screen to display "KES 0" three times, in three
 * decreasing type sizes, above a Withdraw button that could not do
 * anything. The only genuinely useful thing on it was the referral
 * code, in the smallest chip.
 *
 * So there are two layouts:
 *
 * - **Before the first commission**, the referral code IS the content.
 *   It gets the display type, the commission rate sits under it as the
 *   reason to care, and the balance figures are omitted entirely rather
 *   than shown as zeroes. Nothing is stated three times.
 * - **Once money has been earned**, the balance leads, exactly as
 *   before, because now it is a number worth the space.
 *
 * Everything else follows from not showing what isn't there: no
 * visibility toggle when there is no balance to hide, no Pending or
 * Lifetime chip at zero, and no Withdraw button unless there is
 * actually something to withdraw. Offering an action that cannot
 * succeed is the single clearest sign of an unfinished product.
 *
 * The identity row is gone. The top bar already shows this creator's
 * avatar and name a few pixels above, so the hero was rendering the
 * same face twice in one viewport, and "Good afternoon" spent a
 * permanent line on something the reader knows. Stripe and Airbnb do
 * not greet you; they show you your money.
 *
 * Purple rather than the brand orange is unchanged and deliberate:
 * orange is the storefront's "buy" colour, and reusing it for a balance
 * would collide with the CTA language customers already learn. This
 * stays the only saturated surface in the portal.
 */
export function PortalHero({
  statusLabel,
  tierLabel,
  availableKes,
  pendingKes,
  lifetimeKes,
  commissionRateKes,
  referralCode,
  canWithdraw,
}: {
  statusLabel: string;
  tierLabel: string;
  availableKes: number;
  pendingKes: number;
  lifetimeKes: number;
  commissionRateKes: number;
  referralCode: string;
  canWithdraw: boolean;
}) {
  const [hidden, setHidden] = useState(false);
  const [copied, setCopied] = useState(false);
  const format = (n: number) => `KES ${n.toLocaleString()}`;

  /** Lifetime, not available — someone who has earned and withdrawn everything is still an earning creator, and should keep the balance layout. */
  const hasEarned = lifetimeKes > 0;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (insecure context, denied permission).
      // The code is on screen in large type, so it stays copyable by hand.
    }
  }

  return (
    <section
      aria-labelledby="hero-heading"
      className="from-secondary relative overflow-hidden rounded-2xl bg-gradient-to-br to-[#3d1f8f] p-5 text-white shadow-lg shadow-secondary/20 md:p-6"
    >
      {/* One soft highlight, not a field of blobs — it gives the flat
          gradient a light source so the card reads as a surface. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 size-56 rounded-full bg-white/10 blur-3xl"
      />

      <div className="relative">
        {hasEarned ? (
          <EarningLayout
            statusLabel={statusLabel}
            tierLabel={tierLabel}
            availableKes={availableKes}
            pendingKes={pendingKes}
            lifetimeKes={lifetimeKes}
            referralCode={referralCode}
            canWithdraw={canWithdraw}
            hidden={hidden}
            onToggleHidden={() => setHidden((v) => !v)}
            format={format}
            copied={copied}
            onCopy={copyCode}
          />
        ) : (
          <StartingLayout
            statusLabel={statusLabel}
            referralCode={referralCode}
            commissionRateKes={commissionRateKes}
            canWithdraw={canWithdraw}
            copied={copied}
            onCopy={copyCode}
            format={format}
          />
        )}
      </div>
    </section>
  );
}

/**
 * Before the first commission. Roughly a third the height of what this
 * used to render, and every line on it is something the reader does not
 * already know.
 */
function StartingLayout({
  statusLabel,
  referralCode,
  commissionRateKes,
  canWithdraw,
  copied,
  onCopy,
  format,
}: {
  statusLabel: string;
  referralCode: string;
  commissionRateKes: number;
  canWithdraw: boolean;
  copied: boolean;
  onCopy: () => void;
  format: (n: number) => string;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 id="hero-heading" className="text-caption font-medium tracking-wide text-white/70 uppercase">
          Your referral code
        </h2>
        <StatusPill label={statusLabel} />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <p className="text-[2rem] leading-none font-bold tracking-tight md:text-[2.5rem]">{referralCode}</p>
        {/*
          44px target. The old copy affordance was a 20px icon button,
          which is below the minimum on a surface designed for thumbs.
        */}
        <button
          type="button"
          onClick={onCopy}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
        >
          {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          <span className="sr-only">{copied ? 'Code copied' : 'Copy referral code'}</span>
        </button>
      </div>

      <p className="mt-3 text-sm text-white/75">
        {canWithdraw ? (
          <>
            You earn{' '}
            <span className="text-home-lime font-semibold tabular-nums">{format(commissionRateKes)}</span> every time
            someone buys a box with it.
          </>
        ) : (
          <>Your earnings start the moment your account is approved.</>
        )}
      </p>
    </>
  );
}

/** Once real money exists, the balance is worth the space it takes. */
function EarningLayout({
  statusLabel,
  tierLabel,
  availableKes,
  pendingKes,
  lifetimeKes,
  referralCode,
  canWithdraw,
  hidden,
  onToggleHidden,
  format,
  copied,
  onCopy,
}: {
  statusLabel: string;
  tierLabel: string;
  availableKes: number;
  pendingKes: number;
  lifetimeKes: number;
  referralCode: string;
  canWithdraw: boolean;
  hidden: boolean;
  onToggleHidden: () => void;
  format: (n: number) => string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1">
          <h2 id="hero-heading" className="text-caption font-medium tracking-wide text-white/70 uppercase">
            Available balance
          </h2>
          {/* Only offered when there is something to hide, and at a real tap size. */}
          {availableKes > 0 ? (
            <button
              type="button"
              onClick={onToggleHidden}
              aria-pressed={hidden}
              className="-my-2 flex size-11 items-center justify-center rounded-full text-white/60 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            >
              {hidden ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
              <span className="sr-only">{hidden ? 'Show balance' : 'Hide balance'}</span>
            </button>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <StatusPill label={statusLabel} />
          <span className="hidden rounded-full bg-white/15 px-2.5 py-1 text-[0.6875rem] font-medium whitespace-nowrap sm:inline-block">
            {tierLabel}
          </span>
        </div>
      </div>

      <p className="mt-2 text-[2rem] leading-none font-semibold tracking-tight tabular-nums md:text-[2.5rem]">
        {hidden ? '•••••••' : format(availableKes)}
      </p>

      {/* Rendered only when non-zero — a chip reading "Pending KES 0" is a line of nothing. */}
      {pendingKes > 0 || lifetimeKes > 0 ? (
        <dl className="mt-4 flex flex-wrap gap-2">
          {pendingKes > 0 ? (
            <StatChip icon={<Clock className="size-3.5" />} label="Pending" value={format(pendingKes)} />
          ) : null}
          {lifetimeKes > 0 ? (
            <StatChip
              icon={<TrendingUp className="size-3.5" />}
              label="Lifetime earned"
              value={format(lifetimeKes)}
              accent
            />
          ) : null}
        </dl>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {canWithdraw && availableKes > 0 ? (
          <Link
            href="/creator/withdrawals"
            className="text-secondary inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 font-semibold transition-transform duration-150 ease-out hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent focus-visible:outline-none active:translate-y-0"
          >
            Withdraw
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        ) : null}

        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-white/15 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
        >
          {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          {copied ? 'Copied' : referralCode}
        </button>
      </div>

      {!canWithdraw ? (
        <p className="mt-3 text-sm text-white/70">Withdrawals unlock once your account is approved.</p>
      ) : null}
    </>
  );
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-white/15 px-2.5 py-1 text-[0.6875rem] font-medium whitespace-nowrap">{label}</span>
  );
}

function StatChip({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-white/10 py-1.5 pr-3.5 pl-2">
      <span
        aria-hidden="true"
        className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
          accent ? 'bg-home-lime/20 text-home-lime' : 'bg-white/15'
        }`}
      >
        {icon}
      </span>
      <div>
        <dt className="text-[0.6875rem] leading-none font-medium tracking-wide text-white/60 uppercase">{label}</dt>
        <dd className={`mt-1 text-sm leading-none font-semibold tabular-nums ${accent ? 'text-home-lime' : ''}`}>
          {value}
        </dd>
      </div>
    </div>
  );
}
