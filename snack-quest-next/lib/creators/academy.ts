/**
 * Creator Academy content (§ Creator Economy SEO & Authority Strategy)
 * — same code-authored discipline as `lib/blog/posts.ts`, reusing its
 * block shape rather than inventing a parallel one.
 *
 * Every fact about the Creator Program itself (commission, minimum
 * withdrawal, attribution window, no follower requirement) is imported
 * from the real constants, never re-typed. Every claim about the wider
 * creator-monetization landscape is a general, well-established
 * principle (engagement matters more than follower count for small
 * creators, UGC doesn't require an audience of your own), never a
 * specific earnings figure — there is no reliable Kenyan creator-
 * earnings data this codebase can verify, so none is stated as fact.
 */
import type { BlogBlock } from '@/lib/blog/posts';
import { formatKes } from '@/lib/orders/format';
import { CREATOR_COMMISSION_KES, REFERRAL_DISCOUNT_KES } from './referralEconomics';
import { MIN_WITHDRAWAL_KES } from '@/lib/withdrawals/rules';
import { REFERRAL_COOKIE_MAX_AGE_SECONDS } from './referralCookie';

const ATTRIBUTION_DAYS = REFERRAL_COOKIE_MAX_AGE_SECONDS / 60 / 60 / 24;

export interface AcademyFaqItem {
  q: string;
  a: string;
}

export interface AcademyArticle {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  content: BlogBlock[];
  faq: AcademyFaqItem[];
}

export const ACADEMY_HUB = {
  title: 'The Creator Academy',
  description:
    "Practical, Kenya-specific guidance on turning content and an audience into real income — and a real program to put it into practice.",
};

export const ACADEMY_ARTICLES: AcademyArticle[] = [
  {
    slug: 'small-audience',
    title: 'Can you make money with 500 or 1,000 followers in Kenya?',
    description:
      "The honest answer for Kenyan creators with a small following: what's realistic, what actually matters more than follower count, and how to start today.",
    publishedAt: '2026-08-24',
    content: [
      {
        type: 'p',
        text: "Most advice about making money from content assumes you already have a large following. If you're starting with 500, 1,000, or a couple of thousand followers, here's the honest version of what's actually possible.",
      },
      { type: 'h2', text: 'Follower count is not the real gatekeeper' },
      {
        type: 'p',
        text: "A following of 50,000 with almost no engagement is worth less to anyone paying for content than 500 people who actually trust your recommendations and act on them. Brands and affiliate programs increasingly care about engagement and trust over raw reach — a small, real audience is a genuine asset, not something to apologize for.",
      },
      { type: 'h2', text: 'What you can actually do with a small following today' },
      {
        type: 'list',
        items: [
          "Affiliate/referral links — you earn a commission when someone buys through your link, regardless of how many people see it, as long as some of them actually buy.",
          'UGC (user-generated content) — brands pay for content itself, not your reach, since they post it on their own channels. No following required at all.',
          "Your WhatsApp audience counts — a group of people who already trust your recommendations is a real, monetizable audience, even if it's not public-facing.",
        ],
      },
      { type: 'h2', text: 'How Snack Quest works with any size following' },
      {
        type: 'p',
        text: `Snack Quest's Creator Program has no minimum-following requirement — everyone applies and goes through the same review. Every creator earns the same flat ${formatKes(CREATOR_COMMISSION_KES)} for every successful order made through their link, whether they have 500 followers or 50,000. Your audience gets ${formatKes(REFERRAL_DISCOUNT_KES)} off automatically when they buy through your link.`,
      },
      {
        type: 'links',
        intro: 'If UGC is more your style than link-sharing, see',
        items: [{ href: '/creators/academy/ugc-kenya', label: 'how to become a UGC creator in Kenya' }],
      },
    ],
    faq: [
      {
        q: "Do I need a certain number of followers to join Snack Quest's Creator Program?",
        a: 'No. There is no minimum-following requirement — everyone who applies goes through the same review.',
      },
      {
        q: 'What if I only have a WhatsApp group, not a public following?',
        a: "That counts. A WhatsApp group where people already ask what you'd recommend is exactly the kind of audience this works for.",
      },
      {
        q: 'How much can I realistically expect to earn?',
        a: `There's no number we can promise — it depends entirely on your own audience and how often people buy through your link. What's fixed is the rate: ${formatKes(CREATOR_COMMISSION_KES)} for every successful order, with no cap on how many orders you can be credited for.`,
      },
    ],
  },
  {
    slug: 'ugc-kenya',
    title: 'How to become a UGC creator in Kenya',
    description:
      'What UGC actually is, how it differs from influencer marketing, and how to make your first video — starting with zero followers.',
    publishedAt: '2026-08-24',
    content: [
      {
        type: 'p',
        text: "UGC (user-generated content) is one of the few corners of the creator economy where your follower count genuinely doesn't matter. Here's what it actually is, and how to start.",
      },
      { type: 'h2', text: 'UGC vs. influencer marketing — the real difference' },
      {
        type: 'p',
        text: "An influencer gets paid to post on their own account, to their own audience — their reach is the product. A UGC creator gets paid to create a video or photo that the brand then posts on the brand's own channels, or uses in ads. The content is the product, not your following. That's why UGC creators routinely work with zero public following.",
      },
      { type: 'h2', text: 'Do you need followers for UGC?' },
      {
        type: 'p',
        text: 'No. What matters is whether you can create a genuine, well-shot, honest piece of content — a phone camera, decent lighting, and a real reaction to a real product is the whole bar to clear.',
      },
      { type: 'h2', text: 'How to make your first UGC video' },
      {
        type: 'list',
        items: [
          'Film in natural light, facing a window if you can — it matters more than any equipment.',
          'Show the product clearly in the first few seconds — what it is, what it looks like.',
          "Talk like you're telling a friend, not reading an ad.",
          "Give one real, specific reaction — 'the citrus one surprised me' beats 'this is amazing'.",
          'Keep it under a minute for a first attempt — a short, genuine video beats a long polished one.',
        ],
      },
      { type: 'h2', text: 'Practicing with a real product' },
      {
        type: 'p',
        text: "The fastest way to learn UGC is to actually make a video about a real product, not a hypothetical one. Snack Quest's own boxes — a genuine surprise mix of imported snacks — are exactly the kind of product that makes an honest, easy first UGC video: open it on camera and react for real.",
      },
      {
        type: 'links',
        intro: 'See exactly what a Snack Quest box actually is before you film',
        items: [{ href: '/blog/what-is-a-mystery-snack-box', label: 'here' }],
      },
      {
        type: 'p',
        text: "Snack Quest's Creator Program pays a flat commission on referred orders rather than a per-video UGC fee, but it's a real, no-following-required way to get a product in hand and start creating.",
      },
    ],
    faq: [
      {
        q: 'Is UGC the same as being an influencer?',
        a: "No. An influencer is paid for their own reach; a UGC creator is paid for the content itself, which the brand posts on its own channels. You don't need a following for UGC.",
      },
      {
        q: 'Do I need special equipment to start?',
        a: 'No — a phone camera and natural light are enough for a genuine first video. Equipment matters far less than an honest, clear reaction.',
      },
      {
        q: "Can I create UGC-style content for Snack Quest?",
        a: "Snack Quest's Creator Program is referral/affiliate-based — you earn a commission when someone orders through your link — rather than a paid per-video UGC brief. Making honest unboxing or review content is still one of the most effective ways to use your referral link.",
      },
    ],
  },
  {
    slug: 'affiliate-marketing-kenya',
    title: 'How affiliate marketing actually works in Kenya',
    description:
      'The real mechanism behind affiliate/referral links — tracking, commission, and payout — explained with a real, working Kenyan example.',
    publishedAt: '2026-08-24',
    content: [
      {
        type: 'p',
        text: "Affiliate marketing gets explained in the abstract a lot. Here's the actual mechanism, in plain terms, using a real working example.",
      },
      { type: 'h2', text: 'The basic mechanism' },
      {
        type: 'list',
        items: [
          'You get a personal link tied to your account.',
          'Someone clicks it — a cookie or tracking record remembers that click for a set window of time.',
          'If they buy (immediately, or later within that window), the sale is attributed to you.',
          'You earn a commission — either a percentage of the sale, or a fixed amount, depending on the program.',
        ],
      },
      { type: 'h2', text: 'Why payout method actually matters' },
      {
        type: 'p',
        text: 'Many affiliate programs available to Kenyan creators pay out via PayPal, Payoneer, or an international bank transfer — real friction if you just want your money on your phone. A program that pays directly to M-Pesa removes an entire step most Kenyan creators otherwise have to work around.',
      },
      { type: 'h2', text: "How Snack Quest's version works" },
      {
        type: 'list',
        items: [
          `Flat commission: ${formatKes(CREATOR_COMMISSION_KES)} for every successful order through your link — not a percentage, so there's no math to do.`,
          `Your audience gets ${formatKes(REFERRAL_DISCOUNT_KES)} off automatically when they check out through your link.`,
          `Attribution window: ${ATTRIBUTION_DAYS} days — if someone clicks your link and orders within ${ATTRIBUTION_DAYS} days, you're credited even if they didn't buy immediately.`,
          'Commission lands in your dashboard balance the instant the order is paid for — no separate approval step per sale.',
          `Withdraw to M-Pesa once your balance reaches ${formatKes(MIN_WITHDRAWAL_KES)} — one referred sale is enough to hit it.`,
        ],
      },
      {
        type: 'links',
        intro: 'No minimum following is required to join —',
        items: [{ href: '/creators/academy/small-audience', label: 'see what that actually means for a small audience' }],
      },
    ],
    faq: [
      {
        q: 'Do affiliate links expire?',
        a: `Snack Quest's referral links track for ${ATTRIBUTION_DAYS} days after a click — if someone orders within that window, you're still credited even if they didn't buy immediately.`,
      },
      {
        q: 'Is affiliate commission a percentage or a fixed amount?',
        a: "It varies by program — many are percentage-based. Snack Quest's is a flat amount per order, which means the same, predictable payout regardless of what someone buys.",
      },
      {
        q: 'Is there a minimum to join as an affiliate?',
        a: 'For the Creator Program specifically: no minimum following, and it\'s free to apply. There is a minimum balance before you can withdraw — see the small-audience and program FAQs for the exact figure.',
      },
    ],
  },
];

export function getAcademyArticle(slug: string): AcademyArticle | null {
  return ACADEMY_ARTICLES.find((a) => a.slug === slug) ?? null;
}
