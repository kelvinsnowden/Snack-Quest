'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Eye, EyeOff, Sparkles } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

/**
 * The portal's hero (§ Creator Portal premium rebuild, wallet
 * pattern; extended in the reference-image quality pass to fold the
 * identity greeting into the same surface).
 *
 * Modelled on how consumer finance apps open: one saturated card
 * carrying the single number the user came for, everything else
 * subordinate to it. A creator opens this portal to answer "how much
 * have I made" — so that figure gets the boldest surface on the
 * screen rather than sharing a neutral row with click counts.
 *
 * Originally just the balance; the identity row (avatar, greeting,
 * status/tier) used to be a separate plain-background `<header>`
 * above it. Reference apps put avatar+greeting inside the same
 * colored hero the balance sits in, and merging them here is more
 * than cosmetic: this card is still deliberately the *only* saturated
 * surface in the portal (make a second one this loud and both stop
 * working), so growing it to include identity — rather than adding a
 * second colored card beside it — is what keeps that rule true while
 * still giving the identity row real presence instead of small grey
 * text on the page background.
 *
 * Purple rather than the brand orange: orange is the storefront's
 * "buy" colour and reusing it for a balance would collide with the CTA
 * language customers already learn. The lime accent marks the
 * lifetime figure as positive without adding a second heavy hue.
 *
 * The visibility toggle only masks the headline figure — Pending and
 * Lifetime stay visible even when hidden. A creator who wants to hide
 * their balance while someone glances at their screen is worried
 * about the one number that reads as "how much cash do I have right
 * now", not the supporting stats.
 */
export function PortalHero({
  displayName,
  photoURL,
  greeting,
  statusLabel,
  tierLabel,
  availableKes,
  pendingKes,
  lifetimeKes,
  referralCode,
  canWithdraw,
}: {
  displayName: string;
  photoURL: string | null;
  greeting: string;
  statusLabel: string;
  tierLabel: string;
  availableKes: number;
  pendingKes: number;
  lifetimeKes: number;
  referralCode: string;
  canWithdraw: boolean;
}) {
  const [hidden, setHidden] = useState(false);
  const format = (n: number) => `KES ${n.toLocaleString()}`;
  const firstName = displayName.split(' ')[0];
  const initials = (
    displayName
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('') || '?'
  ).toUpperCase();

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
        <div className="flex items-center gap-3">
          <Avatar className="size-11 shrink-0 ring-2 ring-white/25">
            {photoURL ? <AvatarImage src={photoURL} alt="" /> : null}
            <AvatarFallback className="bg-white/15 text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-xs text-white/70">{greeting}</p>
            <p className="truncate text-base font-semibold">{firstName}</p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-[0.6875rem] font-medium whitespace-nowrap">
              {statusLabel}
            </span>
            <span className="hidden rounded-full bg-white/15 px-2.5 py-1 text-[0.6875rem] font-medium whitespace-nowrap sm:inline-block">
              {tierLabel}
            </span>
          </div>
        </div>

        <div className="mt-7 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2
                id="balance-heading"
                className="text-caption font-medium tracking-wide text-white/70 uppercase"
              >
                Available balance
              </h2>
              <button
                type="button"
                onClick={() => setHidden((v) => !v)}
                aria-label={hidden ? 'Show balance' : 'Hide balance'}
                aria-pressed={hidden}
                className="flex size-5 items-center justify-center rounded-full text-white/60 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
              >
                {hidden ? (
                  <EyeOff className="size-3.5" aria-hidden="true" />
                ) : (
                  <Eye className="size-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
            <p className="mt-2 text-[2.5rem] leading-none font-semibold tracking-tight tabular-nums md:text-[3rem]">
              {hidden ? '•••••••' : format(availableKes)}
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
