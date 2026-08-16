import { formatKes } from '@/lib/orders/format';
import { CREATOR_COMMISSION_KES, REFERRAL_DISCOUNT_KES } from '@/lib/creators/referralEconomics';
import { REFERRAL_COOKIE_MAX_AGE_SECONDS } from '@/lib/creators/referralCookie';
import { SUPPORT_EMAIL_ADDRESS } from '@/lib/config/supportEmail';
import { WhatsAppOrderButton } from '@/components/marketing/WhatsAppOrderButton';
import { Reveal } from '../design/Reveal';
import { safeJsonLd } from '@/lib/seo/safeJsonLd';

/**
 * Objection-handling FAQ (§ Creator Program CRO pass, brief item 13) —
 * every answer traces to real product behaviour, not marketing
 * assumption:
 *
 * - Approval is real and stated as such (`CreatorStatus`, `'pending'`
 *   → `'active'` only via `creatorAdminService.updateStatus`), with the
 *   same "usually under a working day" line the dashboard itself shows
 *   a pending creator (`lib/creator/nextStep.ts`).
 * - Commission crediting has no approval gate — verified in
 *   `ReferralService.awardCommission`, which credits
 *   `availableCashKes` directly in the same transaction as the order's
 *   attribution record.
 * - No minimum withdrawal exists — `withdrawalService.requestWithdrawal`
 *   only checks the amount against available balance, never a floor.
 * - The 30-day attribution window is `REFERRAL_COOKIE_MAX_AGE_SECONDS`,
 *   read here rather than typed twice.
 * - Paid ads and refund clawbacks: neither has a defined policy
 *   anywhere in this codebase, so those two answers say that honestly
 *   instead of asserting a rule that doesn't exist.
 * - No exclusivity clause exists anywhere in the schema or rules, so
 *   that answer states there is none.
 */
const attributionDays = REFERRAL_COOKIE_MAX_AGE_SECONDS / 60 / 60 / 24;

const FAQ_ITEMS = [
  {
    q: 'Who can become a Snack Quest creator?',
    a: 'Anyone with an audience that trusts their recommendations — no minimum following, no niche requirement. Everyone applies and goes through the same review.',
  },
  {
    q: 'Do I need a certain number of followers?',
    a: 'No. There is no minimum-following requirement. A small, engaged WhatsApp group counts as much as a large following.',
  },
  {
    q: 'Do I have to pay to join?',
    a: 'No. Applying and joining the Creator Program is free.',
  },
  {
    q: 'Do I need to be approved?',
    a: `Yes. Every application is reviewed before your account is active — this usually takes under a working day. Your referral link is generated as soon as you sign up, so it's ready the moment you're approved.`,
  },
  {
    q: 'How much do I earn per order?',
    a: `${formatKes(CREATOR_COMMISSION_KES)} per qualifying successful order made through your link — the same rate for every creator.`,
  },
  {
    q: 'Does my audience get a discount?',
    a: `Yes — ${formatKes(REFERRAL_DISCOUNT_KES)} off, applied automatically when they check out through your link.`,
  },
  {
    q: 'When is my commission credited?',
    a: 'The moment a customer\'s order is paid for. It lands straight in your available balance — there is no separate approval step for each individual commission.',
  },
  {
    q: 'How do I withdraw my earnings?',
    a: 'Request a withdrawal from your dashboard to your M-Pesa number. Your request is reviewed and paid out via M-Pesa — you\'ll see the status update in your withdrawal history.',
  },
  {
    q: 'Is there a minimum withdrawal amount?',
    a: 'No minimum. You can withdraw any amount up to your available balance.',
  },
  {
    q: 'How do I get my creator link?',
    a: 'It\'s generated automatically the moment you register and appears in your dashboard as soon as you\'re approved — you never have to create or request one.',
  },
  {
    q: 'Where can I share my link?',
    a: 'Wherever your audience already is — TikTok, Instagram, WhatsApp, Facebook, or a direct message.',
  },
  {
    q: 'Can I promote Snack Quest if I have a small audience?',
    a: 'Yes. There is no minimum audience requirement to apply or to earn.',
  },
  {
    q: 'What should I post?',
    a: 'A short reaction video, an Instagram story with your link, a message to a WhatsApp group, or an honest unboxing. Approved creators also get access to opt-in campaigns with ready-made creative assets in the dashboard.',
  },
  {
    q: 'Can I promote Snack Quest without being a traditional influencer?',
    a: 'Yes — if people already ask you what to buy or trust what you recommend, that\'s the audience this program is built for. You don\'t need a public "influencer" following.',
  },
  {
    q: 'Can I use paid ads?',
    a: `This program is built around organic recommendations from your own audience, and there's no set policy for paid promotion yet. If you're considering running ads with your link, message us first so we can confirm it's fine.`,
  },
  {
    q: 'Can I use my creator link in WhatsApp?',
    a: 'Yes — WhatsApp is one of the most common places creators share their link, and it tracks exactly the same as anywhere else.',
  },
  {
    q: 'How are sales tracked?',
    a: `Your link carries your unique code. When someone clicks it, we remember it for ${attributionDays} days, so you're still credited even if they come back to order later. If a customer types your code in at checkout directly, that works too.`,
  },
  {
    q: 'What happens if someone clicks my link but buys later?',
    a: `You're still credited, as long as they order within ${attributionDays} days of clicking your link.`,
  },
  {
    q: 'What happens if a customer cancels or gets refunded?',
    a: 'As things stand, a commission that has already been credited to your balance is not reversed if the order is later refunded.',
  },
  {
    q: 'Can I be a creator for other brands too?',
    a: 'Yes — there is no exclusivity requirement. Nothing stops you from working with other brands as well.',
  },
  {
    q: 'When does the program pay?',
    a: 'Two separate moments: your commission is credited to your dashboard balance the instant an order is paid for, and that balance is paid out to M-Pesa whenever you request a withdrawal — there\'s no fixed payment date, you control the timing.',
  },
  {
    q: 'Who should I contact if my commission looks wrong?',
    a: `Message us on WhatsApp, or email ${SUPPORT_EMAIL_ADDRESS} with your order or referral code and we'll look into it.`,
  },
] as const;

export function CreatorFaq() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  return (
    <section className="bg-background px-5 py-16 md:px-10 md:py-32">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }}
      />
      <Reveal>
        <div className="mx-auto max-w-xl text-center">
          <p className="text-caption text-secondary font-bold tracking-[0.3em] uppercase">FAQ</p>
          <h2 className="font-display mt-4 text-4xl leading-[1.05] font-normal text-balance uppercase md:text-6xl">
            Before you apply.
          </h2>
        </div>
      </Reveal>

      <Reveal delayMs={120}>
        <div className="border-border bg-surface divide-border mx-auto mt-10 flex max-w-3xl flex-col divide-y rounded-2xl border md:mt-16">
          {FAQ_ITEMS.map(({ q, a }) => (
            <details key={q} className="group px-5 py-4 md:px-7 md:py-5">
              <summary className="text-foreground marker:content-none flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold md:text-lg">
                {q}
                <span className="text-foreground/40 shrink-0 text-2xl transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="text-foreground/70 mt-3 text-[15px] leading-[1.65] md:text-base">{a}</p>
            </details>
          ))}
        </div>
      </Reveal>

      <Reveal delayMs={200}>
        <div className="mx-auto mt-8 flex max-w-3xl justify-center md:mt-10">
          <WhatsAppOrderButton message="Hi! I have a question about the Creator Program.">
            Ask us on WhatsApp
          </WhatsAppOrderButton>
        </div>
      </Reveal>
    </section>
  );
}
