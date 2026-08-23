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
  | { type: 'list'; items: string[] }
  /** A short intro clause followed by real internal links (§ internal-linking engine) — for a contextual "see also" sentence that needs actual anchors, not just prose that reads like one. */
  | { type: 'links'; intro: string; items: { href: string; label: string }[] };

/** Topic tags, closed set, used only to compute related posts (§ internal-linking engine) — not a taxonomy exposed anywhere on the page. */
export type BlogTag = 'payments' | 'how-it-works' | 'japan' | 'korea' | 'china' | 'thailand' | 'imported-snacks' | 'mystery-box' | 'kenya';

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  publishedAt: string; // ISO date, e.g. '2026-08-17'
  tags: BlogTag[];
  content: BlogBlock[];
}

const POSTS: BlogPost[] = [
  {
    slug: 'how-to-pay-with-mpesa-online',
    title: 'How to pay for anything in Kenya with M-Pesa, explained for first-timers',
    description:
      "A plain-language walkthrough of what actually happens when you approve an M-Pesa STK push online — using Snack Quest's own checkout as the real example.",
    publishedAt: '2026-08-17',
    tags: ['payments', 'how-it-works'],
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
          "You enter your name and M-Pesa number — just the number the prompt should go to.",
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
        text: "That's the same flow behind every Snack Quest order — pick a box, see the real total, approve on your phone, done.",
      },
      {
        type: 'links',
        intro: "If you'd rather see it than read about it,",
        items: [{ href: '/boxes', label: 'our boxes are the fastest way to try it' }],
      },
    ],
  },
  {
    slug: 'japan-korea-china-thailand-snack-differences',
    title: "Japan, Korea, China, Thailand: what actually makes their snacks different",
    description:
      "A short guide to what sets Japanese, Korean, Chinese, and Thai snacks apart in flavor and style — the four countries Snack Quest sources from.",
    publishedAt: '2026-08-17',
    tags: ['japan', 'korea', 'china', 'thailand', 'imported-snacks'],
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
        text: "If you like clean, precise flavor: start with Japan. If you want a real spice kick: Korea. If you want to be genuinely surprised by variety: China. If you love sweet-sour-spicy all at once: Thailand.",
      },
      {
        type: 'links',
        intro: 'Every Snack Quest box mixes these —',
        items: [
          { href: '/blog/what-is-a-mystery-snack-box', label: 'see how the mix actually works' },
          { href: '/boxes', label: 'or go straight to the boxes' },
        ],
      },
    ],
  },
  {
    slug: 'what-is-a-mystery-snack-box',
    title: 'What is a mystery snack box? How Snack Quest actually works',
    description:
      "The honest explanation of what's inside a Snack Quest box, why it's a surprise, and how ordering, paying, and delivery actually work.",
    publishedAt: '2026-08-24',
    tags: ['mystery-box', 'imported-snacks', 'how-it-works'],
    content: [
      {
        type: 'p',
        text: '"Mystery snack box" gets searched a lot, and answered vaguely a lot. Here\'s the direct version, specific to how Snack Quest actually does it — no vague marketing language.',
      },
      { type: 'h2', text: 'What "mystery" actually means' },
      {
        type: 'p',
        text: "You know the box is a curated mix of imported snacks — chocolate, crunchy bites, sweets, spicy snacks, and drinks — hand-picked from Japan, Korea, China, and Thailand. What you don't know until it arrives is exactly which snacks landed in your specific box. That's the whole idea: a small, genuine surprise, not a random grab-bag.",
      },
      { type: 'h2', text: 'What it is not' },
      {
        type: 'p',
        text: "It's not a single-country box — with one exception: Starter Box is a dedicated noodles-only box, not a country mix. Every other box mixes across all four countries, so there's no way to order \"only Japanese snacks\" or \"only Korean snacks\" from those. If that changes, this page will say so.",
      },
      { type: 'h2', text: 'How ordering, paying, and delivery work' },
      {
        type: 'list',
        items: [
          'Pick a box on the website — no app to install.',
          'Pay with M-Pesa, approved on your own phone.',
          'Door delivery in Nairobi, Ruiru, Kiambu, Kikuyu, Limuru, Kitengela and Thika, or a Fargo Courier pickup point anywhere else in Kenya.',
          'Boxes are hand-packed and usually arrive within 24–48 hours.',
        ],
      },
      {
        type: 'links',
        intro: "That's the short version — for the full walkthrough, including exactly what happens with your M-Pesa prompt, see",
        items: [
          { href: '/how-it-works', label: 'how it works' },
          { href: '/blog/how-to-pay-with-mpesa-online', label: 'how M-Pesa payment actually works' },
        ],
      },
      { type: 'h2', text: "Who it's actually for" },
      {
        type: 'p',
        text: "People who already know they like imported Asian snacks and want an easy way to keep discovering more, people who've never tried them and want a low-effort way to start, and people looking for a genuinely different gift than flowers or chocolate. It's not for someone who wants to guarantee a specific item — that's what the surprise trades away.",
      },
      {
        type: 'p',
        text: "Snack Quest also works with creators who make honest unboxing and review content — a real box like this is exactly the kind of product that makes an easy first video.",
      },
      {
        type: 'links',
        intro: 'No following required —',
        items: [{ href: '/creators/academy/ugc-kenya', label: 'see how to become a UGC creator in Kenya' }],
      },
    ],
  },
  {
    slug: 'japanese-snacks-in-kenya',
    title: 'Japanese snacks in Kenya: what to expect and how to try them',
    description:
      "What Japanese snack culture is actually like, and an easier way to try it in Kenya than tracking down individual imports.",
    publishedAt: '2026-08-24',
    tags: ['japan', 'imported-snacks', 'kenya'],
    content: [
      {
        type: 'p',
        text: "Japanese snacks have built a real following in Kenya over the last few years — mostly through what people have seen online, then gone looking for. Here's what the category is actually like, and what your options are for trying it.",
      },
      { type: 'h2', text: "What makes it distinct" },
      {
        type: 'p',
        text: "Japanese snacks lean toward controlled, layered flavor over an all-out sugar or spice hit — think a soy-glazed rice cracker, or a Kit Kat in a flavor you'd never see on a Kenyan supermarket shelf (matcha, strawberry, even wasabi). Texture is often the point as much as taste.",
      },
      { type: 'h2', text: 'What to look out for' },
      {
        type: 'list',
        items: [
          'Kit Kat, in flavors far beyond the usual chocolate bar',
          'Mochi — a soft, chewy rice-flour treat, often with a filled center',
          'Rice crackers (senbei), savory and often soy-glazed',
          'Ramune, a Japanese carbonated soft drink in a distinctive marble-stoppered bottle',
        ],
      },
      { type: 'h2', text: 'Getting them in Kenya' },
      {
        type: 'p',
        text: "A handful of specialty import grocers in Nairobi carry individual Japanese items, but it means knowing what to look for and buying piece by piece. The easier way in is a curated box: Snack Quest hand-picks a mix that includes Japanese snacks alongside Korean, Chinese, and Thai ones, delivered to your door in Nairobi or to a Fargo Courier pickup point anywhere else in Kenya — no hunting required, though which Japanese items land in your specific box is part of the surprise.",
      },
      {
        type: 'links',
        intro: 'For the full picture of how Japan compares to Korea, China, and Thailand, see our',
        items: [
          { href: '/blog/japan-korea-china-thailand-snack-differences', label: 'snack differences guide' },
          { href: '/blog/what-is-a-mystery-snack-box', label: 'what a mystery box actually is' },
        ],
      },
    ],
  },
  {
    slug: 'korean-snacks-in-kenya',
    title: 'Korean snacks in Kenya: what to expect and how to try them',
    description:
      "What Korean snack culture is actually like, and an easier way to try it in Kenya than tracking down individual imports.",
    publishedAt: '2026-08-24',
    tags: ['korea', 'imported-snacks', 'kenya'],
    content: [
      {
        type: 'p',
        text: "Korean snacks have ridden the same wave of interest as K-dramas and K-pop into Kenya — and the category holds up on its own once you actually try it. Here's what to expect, and how to get hold of it.",
      },
      { type: 'h2', text: 'What makes it distinct' },
      {
        type: 'p',
        text: "Korean snacks go for bold, immediate flavor — real chili heat, sweet-and-spicy sauces, and savory-sweet combinations that don't have a direct Kenyan equivalent. Corn and rice-based snacks are everywhere, and instant-noodle-flavored chips are a genuine, popular category, not a novelty item.",
      },
      { type: 'h2', text: 'What to look out for' },
      {
        type: 'list',
        items: [
          'Honey butter chips — the snack credited with starting the whole Korean-snack trend abroad',
          'Tteokbokki-flavored chips, built on Korea\'s spicy rice-cake street food',
          'Banana milk, a genuinely different sweet drink most Kenyans have never had',
          'Choco pies — a soft cake-and-marshmallow snack, a Korean staple for decades',
        ],
      },
      { type: 'h2', text: 'Getting them in Kenya' },
      {
        type: 'p',
        text: "A few specialty import grocers in Nairobi stock individual Korean items, but again — you need to know what to ask for. Snack Quest's curated boxes mix Korean snacks in with Japanese, Chinese, and Thai ones and deliver anywhere in Kenya, so trying the category doesn't require sourcing it yourself. Which Korean items show up in your box is part of the mystery.",
      },
      {
        type: 'links',
        intro: 'See how Korea compares to Japan, China, and Thailand in our',
        items: [
          { href: '/blog/japan-korea-china-thailand-snack-differences', label: 'snack differences guide' },
          { href: '/blog/what-is-a-mystery-snack-box', label: 'what a mystery box actually is' },
        ],
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

/**
 * Related posts by shared tag count, most-shared first, ties broken by
 * recency (§ internal-linking engine) — automatic, so a new post with
 * the right tags immediately joins the link graph without editing
 * every other post that should now point to it.
 */
export function getRelatedPosts(slug: string, limit = 2): BlogPost[] {
  const current = getPostBySlug(slug);
  if (!current) {
    return [];
  }
  return POSTS.filter((post) => post.slug !== slug)
    .map((post) => ({ post, shared: post.tags.filter((tag) => current.tags.includes(tag)).length }))
    .filter(({ shared }) => shared > 0)
    .sort((a, b) => b.shared - a.shared || b.post.publishedAt.localeCompare(a.post.publishedAt))
    .slice(0, limit)
    .map(({ post }) => post);
}
