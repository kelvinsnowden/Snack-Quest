/**
 * Blog content (§ SEO/AEO visibility audit) — code-authored rather
 * than a CMS: posts ship the same way every other marketing page does
 * (a PR, reviewed, deployed), which is the right tradeoff at today's
 * cadence of roughly one post a week. If a non-developer needs to
 * publish independently later, that's a real reason to build an admin
 * UI for this — not a reason to build one speculatively now.
 *
 * Deliberately grounded only in facts already true elsewhere in this
 * codebase (how checkout/M-Pesa/delivery actually work, per
 * `public/llms.txt` and `app/(marketing)/how-it-works/page.tsx`) or
 * well-established, uncontroversial general knowledge — never a
 * specific box name, price, or bestseller claim this file can't
 * verify against real product data.
 */

export type BlogBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'list'; items: string[] };

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  publishedAt: string; // ISO date, e.g. '2026-08-17'
  content: BlogBlock[];
}

const POSTS: BlogPost[] = [
  {
    slug: 'how-to-pay-with-mpesa-online',
    title: 'How to pay for anything in Kenya with M-Pesa, explained for first-timers',
    description:
      "A plain-language walkthrough of what actually happens when you approve an M-Pesa STK push online — using Snack Quest's own checkout as the real example.",
    publishedAt: '2026-08-17',
    content: [
      {
        type: 'p',
        text: "If you've never paid a website with M-Pesa before, the whole thing can feel like a leap of faith — you type in your phone number, tap a button, and hope something happens. Here's exactly what's supposed to happen, and what each step actually means.",
      },
      { type: 'h2', text: "What's an STK push?" },
      {
        type: 'p',
        text: "STK push is Safaricom's own name for the payment prompt that pops up on your phone screen — the same green M-Pesa menu you'd see if you initiated a payment yourself, except a website triggered it on your behalf, for the exact amount you were shown before you paid. It only appears after you've confirmed a purchase; it's never something that shows up out of nowhere.",
      },
      { type: 'h2', text: 'The four things that actually happen' },
      {
        type: 'list',
        items: [
          "You enter your name and M-Pesa number — no account or password needed, just the number the prompt should go to.",
          "You see a final total before anything is charged — at Snack Quest, this includes any delivery or pickup fee, calculated automatically, so there's no separate charge later.",
          "You approve the prompt on your own phone, using your own M-Pesa PIN — the website never sees or asks for that PIN.",
          "The page confirms automatically once Safaricom confirms the payment — no refreshing, no waiting for an email.",
        ],
      },
      { type: 'h2', text: "If nothing happens" },
      {
        type: 'p',
        text: "Two things can go wrong, and they look similar but aren't: the prompt genuinely didn't arrive (check for a stuck data connection, or that the number entered was correct), or it arrived and was cancelled or timed out before you approved it. Either way, no money moves unless you actually enter your PIN and confirm — a failed or ignored prompt never charges you.",
      },
      { type: 'h2', text: 'Why this is actually safer than it feels' },
      {
        type: 'p',
        text: "The two things people worry about most — a wrong amount being charged, or a payment going through without their approval — are exactly the two things this flow is built to prevent. The amount is fixed before the prompt is sent, and nothing moves without your PIN on your own phone. A website can ask Safaricom to send you a prompt; it can never approve one for you.",
      },
      {
        type: 'p',
        text: "That's the same flow behind every Snack Quest order — pick a box, see the real total, approve on your phone, done. If you'd rather see it than read about it, our boxes are the fastest way to try it.",
      },
    ],
  },
  {
    slug: 'japan-korea-china-thailand-snack-differences',
    title: "Japan, Korea, China, Thailand: what actually makes their snacks different",
    description:
      "A short guide to what sets Japanese, Korean, Chinese, and Thai snacks apart in flavor and style — the four countries Snack Quest sources from.",
    publishedAt: '2026-08-17',
    content: [
      {
        type: 'p',
        text: "\"Asian snacks\" gets used as one category, but the four countries behind most of what shows up in a Snack Quest box each have a genuinely different snacking culture. Knowing the difference makes it easier to guess what you'll actually like before you try it.",
      },
      { type: 'h2', text: 'Japan: precision and umami' },
      {
        type: 'p',
        text: "Japanese snacks tend toward controlled, layered flavor rather than an all-out sugar or spice hit — think a rice cracker with a soy glaze, or a Kit Kat in a flavor you'd never see anywhere else (matcha, sake, wasabi). Texture matters as much as taste: a lot of Japanese snacks are built around a specific crunch or chew, not just a flavor profile.",
      },
      { type: 'h2', text: 'Korea: bold, and often genuinely spicy' },
      {
        type: 'p',
        text: "Korean snacks lean into strong, immediate flavor — sweet-and-spicy sauces, real chili heat, and a lot of savory-sweet combinations that don't have a direct Western equivalent. Corn-based and rice-based snacks are common, and instant-noodle-flavored chips are a genuine, popular category, not a novelty.",
      },
      { type: 'h2', text: 'China: variety across a huge map' },
      {
        type: 'p',
        text: "China's snack aisle is less one style than a whole spectrum — from mild, savory dried fruits and nuts to intensely spicy, numbing (mala) flavors from Sichuan-style seasoning. Regional variety is the actual defining trait here more than any single flavor profile.",
      },
      { type: 'h2', text: 'Thailand: sweet, sour, and spicy at once' },
      {
        type: 'p',
        text: "Thai snacks often try to hit sweet, sour, and spicy in the same bite — dried mango with a chili-salt coating is a classic example. Coconut and tamarind show up often, and even Thai potato chip flavors tend to be bolder and more layered than their Western counterparts.",
      },
      { type: 'h2', text: "So which one's actually for you?" },
      {
        type: 'p',
        text: "If you like clean, precise flavor: start with Japan. If you want a real spice kick: Korea. If you want to be genuinely surprised by variety: China. If you love sweet-sour-spicy all at once: Thailand. Every Snack Quest box mixes these — the fastest way to actually find your favorite is trying one.",
      },
    ],
  },
];

export function listPosts(): BlogPost[] {
  return [...POSTS].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function getPostBySlug(slug: string): BlogPost | null {
  return POSTS.find((post) => post.slug === slug) ?? null;
}
