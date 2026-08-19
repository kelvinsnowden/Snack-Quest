import type { CreatorDashboardAccessLevel } from '@/services/creatorDashboardService';
import type { CreatorStatus } from '@/types/creatorProfile';

/**
 * "What should I do next?" — answered from state the system actually
 * has (§ Creator Portal premium rebuild).
 *
 * Deliberately not a milestone ladder. `tier` is a real schema field
 * but nothing in this codebase promotes between tiers (see
 * `lib/creators/tier.ts`), so "3 more orders to Silver" would be an
 * invented promise the product cannot keep. Every branch below reads a
 * counter that exists and is maintained.
 *
 * Ordered by what blocks the creator soonest: an account problem beats
 * an empty funnel, an empty funnel beats an idle balance. Only one
 * step is ever shown — a list of five suggestions is a backlog, not
 * guidance, and re-creates the cognitive load this is meant to remove.
 *
 * Pure so the precedence is unit-testable without rendering.
 */

export type NextStep = {
  /** Stable key for tests and analytics, not shown to the user. */
  id:
    | 'suspended'
    | 'awaiting-approval'
    | 'create-first-link'
    | 'share-link'
    | 'awaiting-first-order'
    | 'withdraw'
    | 'keep-sharing';
  title: string;
  body: string;
  cta?: { label: string; href: string };
  /**
   * A quieter second link, only on the steps where "I don't know what
   * to post" is the real blocker rather than a missing click
   * (§ Mission 2 — creator activation). It points at the Creator
   * Academy, which already exists and is already written — this adds a
   * route to it from the moment a creator needs it, and no new content.
   *
   * Deliberately absent everywhere else: the whole point of this module
   * is one instruction at a time, and a second link on a step whose
   * blocker is "you have no link yet" is just noise.
   */
  secondaryCta?: { label: string; href: string };
  tone: 'neutral' | 'positive' | 'blocked';
};

/** Where a creator goes when the blocker is knowing what to make, not what to click. */
const ACADEMY_CTA = { label: 'Not sure what to post?', href: '/creators/academy' } as const;

export function resolveNextStep(input: {
  accessLevel: CreatorDashboardAccessLevel;
  status: CreatorStatus;
  linkCount: number;
  totalClicks: number;
  totalConversions: number;
  availableCashKes: number;
}): NextStep {
  if (input.accessLevel === 'suspended') {
    return {
      id: 'suspended',
      tone: 'blocked',
      title: 'Your account is on hold',
      body: 'Existing earnings are safe, but new referrals will not earn while your account is suspended. Support can tell you why.',
    };
  }

  if (input.status === 'pending') {
    return {
      id: 'awaiting-approval',
      tone: 'blocked',
      title: 'We are reviewing your profile',
      body: 'Approval usually takes under a working day. You can set up a referral link now so it is ready the moment you are approved.',
      cta: { label: 'Set up a link', href: '/creator/referrals' },
    };
  }

  if (input.linkCount === 0) {
    return {
      id: 'create-first-link',
      tone: 'neutral',
      title: 'Create your first referral link',
      body: 'Your link is how orders get traced back to you. It takes about ten seconds to make one.',
      cta: { label: 'Create a link', href: '/creator/referrals' },
    };
  }

  if (input.totalClicks === 0) {
    return {
      id: 'share-link',
      tone: 'neutral',
      title: 'Share your link to start earning',
      body: 'Nobody has opened it yet. A single story or bio link is usually enough to get the first clicks moving.',
      cta: { label: 'Get your link', href: '/creator/referrals' },
      secondaryCta: ACADEMY_CTA,
    };
  }

  if (input.totalConversions === 0) {
    return {
      id: 'awaiting-first-order',
      tone: 'neutral',
      title: 'People are clicking — no orders yet',
      body: `${input.totalClicks.toLocaleString()} ${input.totalClicks === 1 ? 'person has' : 'people have'} opened your link. Telling them what is actually in the box is what usually turns a click into an order.`,
      cta: { label: 'See what is inside', href: '/boxes' },
      secondaryCta: ACADEMY_CTA,
    };
  }

  if (input.availableCashKes > 0) {
    return {
      id: 'withdraw',
      tone: 'positive',
      title: 'You have earnings ready to withdraw',
      body: 'Your available balance can be sent to your M-Pesa number whenever you want it.',
      cta: { label: 'Withdraw', href: '/creator/withdrawals' },
    };
  }

  return {
    id: 'keep-sharing',
    tone: 'positive',
    title: 'You are all caught up',
    body: 'Everything you have earned has been withdrawn. Campaigns are the quickest way to earn more than the standard commission.',
    cta: { label: 'Browse campaigns', href: '/creator/campaigns' },
  };
}
