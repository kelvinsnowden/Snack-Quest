/**
 * The one authoritative, factual definition of what Snack Quest is
 * (§ Entity & Authority SEO Phase) — every surface that needs to
 * describe the brand (root metadata, Organization JSON-LD, /about,
 * llms.txt) pulls from here instead of restating it independently, so
 * a future change to how the business is described happens once, not
 * in five places that can quietly drift apart.
 *
 * Every fact below is already true elsewhere in this codebase —
 * nothing here is new information, just centralized. Sources: the
 * homepage's own copy (`app/(marketing)/page.tsx`,
 * `FounderStory.tsx`, `WhatsInside.tsx`), `public/llms.txt`, and
 * `lib/config/socialLinks.ts`. Do not add a fact here that isn't
 * already stated and verified on the live site.
 */

export const BRAND_NAME = 'Snack Quest';

/** As it already appears on the homepage's own "Meet the founder" section — never invent a surname or title beyond what's public there. */
export const FOUNDER_NAME = 'Kelvin';

export const SOURCE_COUNTRIES = ['Japan', 'Korea', 'China', 'Thailand'] as const;

/**
 * ~150 characters — for metadata `description`/OG fallbacks, where a
 * long entity description gets truncated anyway.
 */
export const BRAND_DESCRIPTION_SHORT =
  'Snack Quest is a Kenya-based mystery snack box company: hand-picked imported snacks from Japan, Korea, China & Thailand, delivered nationwide.';

/**
 * The full entity description — for Organization JSON-LD and the
 * /about page's lead. Deliberately states the one fact people most
 * often get wrong about the product: boxes are a curated *mix*, not a
 * single-origin selection — see WhatsInside.tsx's own "no two
 * adventures are ever the same" and the honest FAQ answer this same
 * phase adds.
 */
export const BRAND_DESCRIPTION_LONG =
  'Snack Quest is a Kenya-based mystery snack box company. Every box is a hand-picked, personally tasted mix of imported snacks from Japan, Korea, China, and Thailand — a curated surprise, not a single-country selection. Customers order and pay by M-Pesa directly on the website, no app or account needed, and boxes are delivered nationwide: to a Jumia pickup station anywhere in Kenya, or by Bolt door delivery in Nairobi, usually within 24–48 hours.';
