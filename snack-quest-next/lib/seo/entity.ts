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

/**
 * The countries a box actually draws from today. Still exactly four —
 * this is a fact about what ships, not a statement of ambition, and it
 * changes only when the buying does.
 *
 * The brand is positioned as international snack discovery rather than
 * an Asia-only shop (§ international positioning), but that positioning
 * always travels with "first stop Asia" alongside it. Dropping the
 * qualifier would make the site promise a range the boxes don't
 * contain — the same failure as the fabricated bestseller badge, just
 * pointed at sourcing instead of sales.
 *
 * "First stop", not "starting in": Asia is the first of several ranges
 * and stays permanently, not a phase the brand passes through. Copy
 * that implies otherwise would be wrong about the plan as well as
 * unhelpful to anyone who liked their Japanese box.
 */
export const SOURCE_COUNTRIES = ['Japan', 'Korea', 'China', 'Thailand'] as const;

/** The category the brand is in, independent of where it currently buys. */
export const BRAND_CATEGORY = 'international snacks';

/** How the current sourcing region is described wherever the international framing appears. */
export const CURRENT_SOURCING_REGION = 'Asia';

/**
 * ~150 characters — for metadata `description`/OG fallbacks, where a
 * long entity description gets truncated anyway.
 */
export const BRAND_DESCRIPTION_SHORT =
  'Snack Quest is a Kenya-based mystery snack box company: hand-picked international snacks. First stop Asia — Japan, Korea, China & Thailand.';

/**
 * The full entity description — for Organization JSON-LD and the
 * /about page's lead. States two things people get wrong: boxes are a
 * curated *mix* rather than a single-origin selection, and the range
 * is where the brand has started rather than where it ends.
 */
export const BRAND_DESCRIPTION_LONG =
  'Snack Quest is a Kenya-based mystery snack box company bringing international snacks to Kenya. Every box is a hand-picked, personally tasted mix of imported snacks — a curated surprise, not a single-country selection. The first stop is Asia: the range currently covers Japan, Korea, China and Thailand, and grows from there. Customers order and pay by M-Pesa directly on the website, no app needed, and boxes are delivered nationwide: to the door in Nairobi and the surrounding towns, or to a Fargo Courier pickup point anywhere else in Kenya, usually within 24–48 hours.';
