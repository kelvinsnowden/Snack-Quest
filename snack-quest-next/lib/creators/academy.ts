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
        items: [
          { href: '/creators/academy/ugc-kenya', label: 'how to become a UGC creator in Kenya' },
          { href: '/creators/academy/brand-deals-kenya', label: 'or how brand deals actually get priced' },
        ],
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
      {
        type: 'links',
        intro: 'Once you have a few real videos, see',
        items: [{ href: '/creators/academy/brand-deals-kenya', label: 'how to turn them into your first paid brand deal' }],
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
  {
    slug: 'tiktok-kenya',
    title: 'How to make money on TikTok in Kenya',
    description:
      "The honest version: what TikTok's own monetization program actually requires (and why it doesn't apply to Kenya yet), and what real options exist instead.",
    publishedAt: '2026-08-31',
    content: [
      {
        type: 'p',
        text: "Most 'make money on TikTok' guides skip the one detail that actually matters most for a Kenyan creator: whether TikTok's own in-app program is even open to you. It isn't, today. Here's what's actually true, and what to do instead.",
      },
      { type: 'h2', text: "What TikTok's own Creator Rewards Program actually requires" },
      {
        type: 'p',
        text: "TikTok's official in-app monetization program (Creator Rewards) is currently limited to accounts registered in a specific list of countries — the United States, United Kingdom, Germany, Japan, South Korea, France, Mexico, and Brazil, as TikTok documents it. Kenya is not on that list. That means a Kenya-registered account cannot qualify for it today, regardless of follower count or views. Platform programs like this change over time, so check TikTok's own Creator Rewards page directly before assuming this is permanent — but don't trust a guide (including this one, eventually) that doesn't mention the restriction at all.",
      },
      { type: 'h2', text: "What's actually available to Kenyan TikTok creators" },
      {
        type: 'list',
        items: [
          'Live Gifts — viewers send virtual gifts during a livestream, which convert to real payouts, processed for Kenyan creators via Pesapal and withdrawable to M-Pesa.',
          'Brand partnerships and sponsored content — a brand pays you directly to feature their product; this works the same in Kenya as anywhere else and does not depend on TikTok\'s own program.',
          "Affiliate/referral links — earning a commission when your audience buys through a link you share, on TikTok or anywhere else.",
          'UGC — creating video content brands pay for and post on their own channels, which needs no following at all.',
        ],
      },
      { type: 'h2', text: 'What about TikTok Shop?' },
      {
        type: 'p',
        text: "TikTok Shop's status in Kenya is genuinely unsettled as this is written — some sources describe it as active, others list Kenya as not yet fully rolled out. Rather than state a firm yes or no that might be wrong by the time you read this, check TikTok's own Seller Center for the current status before planning around it.",
      },
      { type: 'h2', text: 'Do you need a certain follower count?' },
      {
        type: 'p',
        text: "Not for the paths above. Live Gifts scale with an engaged live audience, not a follower badge; brand deals and UGC increasingly go to creators with real engagement over raw reach; and affiliate/referral earning has never required a minimum following in the first place.",
      },
      {
        type: 'links',
        intro: 'For the mechanics behind two of those paths, see',
        items: [
          { href: '/creators/academy/ugc-kenya', label: 'how UGC actually works' },
          { href: '/creators/academy/affiliate-marketing-kenya', label: 'how affiliate marketing works' },
        ],
      },
    ],
    faq: [
      {
        q: "Can Kenyan creators join TikTok's Creator Rewards Program?",
        a: "Not currently. TikTok's documented eligible countries are the US, UK, Germany, Japan, South Korea, France, Mexico, and Brazil — Kenya is not included. Check TikTok's own program page for the current list, since it can change.",
      },
      {
        q: 'Is TikTok Shop available in Kenya?',
        a: "It's genuinely unclear as of this writing — sources disagree. Check TikTok's own Seller Center directly rather than relying on any one article, including this one.",
      },
      {
        q: 'Do I need a large following to make money on TikTok in Kenya?',
        a: 'No — Live Gifts, brand deals, UGC, and affiliate/referral links are all real, currently-available paths that don\'t require TikTok\'s own (currently Kenya-ineligible) monetization program or a large following.',
      },
    ],
  },
  {
    slug: 'brand-deals-kenya',
    title: 'How to get your first brand deal in Kenya',
    description:
      "There's no fixed Kenyan rate card for sponsored content — here's the real methodology for pricing, a media kit that works, and how to pitch without a track record yet.",
    publishedAt: '2026-08-31',
    content: [
      {
        type: 'p',
        text: "No reliable, current Kenyan rate card for sponsored posts exists — anyone quoting you an exact number as 'the going rate' is guessing. What actually works is a methodology, and a real way to start before you have a track record.",
      },
      { type: 'h2', text: "There's no fixed rate — here's what actually sets your price" },
      {
        type: 'list',
        items: [
          'The size and engagement of the specific audience you\'re delivering, not your total follower count — a small, highly engaged audience is worth more than a large, quiet one.',
          'What the brand is actually asking for — one post is priced differently from a post plus usage rights, a story series, or a video edit they can reuse in ads.',
          'Your own track record — your first few collaborations are reasonably priced lower (or done for a real product plus a fair fee) to build proof you can point to next time.',
        ],
      },
      { type: 'h2', text: 'Build a real media kit' },
      {
        type: 'p',
        text: "One or two pages, no more. A brand manager skimming a stack of pitches won't read further. Include: a short bio, your real audience numbers (honestly, not inflated), what kind of content you make, any past collaborations, and how to contact you.",
      },
      { type: 'h2', text: 'How to actually pitch a brand' },
      {
        type: 'p',
        text: "A personalized message explaining specifically why your audience fits their product beats a generic 'collab?' DM every time. Expect most pitches to go unanswered — that's normal, not a sign you're doing it wrong — and treat each one as practice for the next.",
      },
      { type: 'h2', text: "Starting without any past brand deals" },
      {
        type: 'p',
        text: "Every creator's media kit is empty at some point. UGC-style content and a real, working referral program are two ways to build genuine proof of work before your first paid brand pitch — something to actually show, not just claim.",
      },
      {
        type: 'links',
        intro: 'See how to build that first real example with',
        items: [{ href: '/creators/academy/ugc-kenya', label: 'a UGC video' }],
      },
    ],
    faq: [
      {
        q: 'How much should I charge for a sponsored post?',
        a: "There's no fixed answer — price scales with your real, engaged audience size and exactly what the brand is asking for (one post vs. usage rights vs. a series), not a flat per-follower number anyone can quote you.",
      },
      {
        q: 'Do I need a media kit to get my first brand deal?',
        a: "It helps, but it's not mandatory for a first small collaboration. It becomes far more useful once you're pitching brands you don't already have a relationship with.",
      },
      {
        q: "What if I've never had a brand deal before?",
        a: 'Start by building real, honest content you can point to — UGC-style videos or a working referral program (like the Snack Quest Creator Program) are both real ways to build proof of work with no prior deals required.',
      },
    ],
  },
  {
    slug: 'whatsapp-kenya',
    title: 'How Kenyan creators can monetize WhatsApp',
    description:
      'The real, legitimate ways to earn from a WhatsApp audience in Kenya — and why "get paid to view Status" claims deserve real skepticism.',
    publishedAt: '2026-08-31',
    content: [
      {
        type: 'p',
        text: "WhatsApp is where a huge amount of real trust and buying decisions happen in Kenya — arguably more than any single social app. Here's what actually works for monetizing that, and what to be skeptical of.",
      },
      { type: 'h2', text: 'The legitimate ways to monetize WhatsApp' },
      {
        type: 'list',
        items: [
          'A WhatsApp Business catalog — if you have products of your own, WhatsApp Business lets you list and sell them directly in-chat.',
          'Status as a free promotion channel — sharing genuine recommendations or updates with people who already opted in to see them, at no cost.',
          "Sharing an affiliate or referral link with your WhatsApp audience — the same mechanism as anywhere else, applied to a channel where people already trust what you send them.",
        ],
      },
      { type: 'h2', text: 'Be skeptical of "get paid to post/view WhatsApp Status"' },
      {
        type: 'p',
        text: "A number of sites claim you can earn money simply by posting or viewing WhatsApp Status updates through some third-party scheme. That pattern — payment disconnected from any real product, sale, or service — is exactly the kind of claim worth treating with real skepticism. The legitimate paths above all involve an actual product, sale, or referral behind the payment; a scheme that doesn't have one is a reason to slow down.",
      },
      { type: 'h2', text: 'Using your WhatsApp audience with Snack Quest' },
      {
        type: 'p',
        text: "A WhatsApp group or broadcast list where people already ask what you'd recommend is a real, monetizable audience — you don't need it to be a public following. Sharing your Snack Quest referral link there works exactly the same as sharing it anywhere else, and is tracked the same way.",
      },
      {
        type: 'links',
        intro: 'See the full mechanism in',
        items: [{ href: '/creators/academy/affiliate-marketing-kenya', label: 'how affiliate marketing actually works' }],
      },
    ],
    faq: [
      {
        q: 'Can I really earn money by posting my WhatsApp Status?',
        a: 'Be skeptical of schemes that pay simply for posting or viewing Status with no real product or sale behind it. Legitimate WhatsApp monetization — a business catalog, Status as promotion, or sharing a referral link — always involves an actual transaction.',
      },
      {
        q: 'Do I need a WhatsApp Business account?',
        a: "It helps if you're selling your own products through a catalog, but it's not required to share a referral link or use Status to promote something — a regular WhatsApp account works fine for those.",
      },
      {
        q: 'Can I share my Snack Quest referral link on WhatsApp?',
        a: 'Yes — WhatsApp is one of the most common places creators share their link, and it tracks exactly the same as anywhere else.',
      },
    ],
  },
];

export function getAcademyArticle(slug: string): AcademyArticle | null {
  return ACADEMY_ARTICLES.find((a) => a.slug === slug) ?? null;
}
