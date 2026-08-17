# SEO & Entity Authority Strategy

Written as part of the Entity & Authority SEO Phase (Aug 2026). Companion
to the earlier technical SEO audit — this document is about *authority*:
making Snack Quest a clearly defined, consistently represented, citable
brand, not just a technically well-formed website.

The guiding rule for everything in this phase, restated because it
governs every decision below: **build a real brand/entity with real
evidence and useful content — never an SEO facade.** Nothing here states
a fact the codebase can't already prove.

## 1. What Snack Quest can build itself (done, or ready to extend)

Everything in this section is code — no external account, no outreach,
no waiting on anyone.

- **One authoritative entity description** (`lib/seo/entity.ts`), used
  consistently (not copy-pasted) across root metadata, Organization
  JSON-LD, `/about`, `/press`, and `llms.txt`.
- **Organization schema** now carries `description`, `brand`,
  `knowsAbout` (imported snacks, Japanese/Korean/Asian snacks, mystery
  snack boxes, Kenya), and a real `founder` reference — all facts
  already public on the homepage, not invented for this phase.
- **`/about`** — the canonical entity page: the real founder story
  (already public on the homepage), the real product facts, and
  `AboutPage` + `Person` (founder) structured data.
- **`/press`** — a real, honest resource for journalists/partners:
  brand facts, logo, contact. States plainly that there's no press
  coverage yet rather than inventing any. Exists so a future real
  mention has somewhere obvious to point back to.
- **Entity-defining FAQs** added to the real FAQ content (not
  schema-only) — "What is Snack Quest?", "Where do the snacks come
  from?", and the honest disambiguation that boxes are a multi-country
  mix, not a single-origin selection.
- **Five-post blog** (was two before this phase) covering the highest-
  intent honest angles: M-Pesa payments, a Japan/Korea/China/Thailand
  comparison, what a mystery box actually is, and Kenya-specific guides
  to Japanese and Korean snacks. Each links to the others via a
  tag-based related-posts system (`lib/blog/posts.ts`,
  `getRelatedPosts`) and to relevant product/FAQ/how-it-works pages —
  the internal-linking engine this phase asked for. New posts join the
  link graph automatically by sharing tags; nothing has to be manually
  rewired.
- **Cross-links from commercial pages to educational content** —
  `/boxes`, `/how-it-works`, and `/faq` now link into the blog, and the
  blog links back to `/boxes` — the hub-and-spoke structure Phase 4/8
  asked for, without inventing category pages that pretend to filter
  real inventory by origin (see §3 for why that was deliberately not
  built).
- **`llms.txt`** now answers the exact entity questions an AI system
  would ask directly ("What is Snack Quest?", "Does it deliver in
  Kenya?", etc.), and explicitly warns against the one likely
  hallucination: that a single-country box exists.
- **Sitemap** includes `/about`, `/press`, and all five blog posts.

## 2. What requires Kelvin

Nothing above needed an account Claude doesn't have. These do:

- **Run `npm run faqs:refresh` in production** (needs
  `FIREBASE_ADMIN_CLIENT_EMAIL`/`FIREBASE_ADMIN_PRIVATE_KEY`, which this
  session doesn't hold) — the three new entity FAQs
  (`scripts/faqContent.mjs`) only reach the live site and the FAQPage
  schema once this runs. Until then, `/faq` still works, just without
  the three new questions.
- **Quickly confirm the three `sameAs` social links are still live and
  correct**: `facebook.com/snackquestke`, `instagram.com/snack_questke`,
  `tiktok.com/@snackquests` (`lib/config/socialLinks.ts`). This
  environment's outbound network is blocked from reaching any social
  platform, so this phase could not verify them — they were already in
  the codebase from earlier work, not newly added here, but Phase 12
  explicitly asks for real verification and that's honestly not
  something this session could do.
- **Google Business Profile** — free, fast, and one of the highest-
  leverage things for local Kenyan search and Maps visibility. Not
  started; Kelvin said he'd handle it separately.
- **Search Console / Bing Webmaster actions that need account
  ownership** — see §5 for the exact URLs to submit.
- **Everything that is fundamentally not code**: social account
  creation beyond what already exists, business directory listings, PR
  outreach, creator outreach, partnership conversations, and asking
  real customers for reviews. See §4.

## 3. A deliberate scope decision: no fake "shop by origin" pages

The brief asked for category landing pages (Japanese Snacks → Korean
Snacks → Snack Boxes, etc.). Those were **not** built as commerce
category/filter pages, and this is a considered decision, not an
oversight:

`Package` (the real product type, `types/package.ts`) has no
origin-country or category field. Every box is a curated mix across
Japan, Korea, China, and Thailand — confirmed by the homepage's own
copy ("no two adventures are ever the same") and by the actual data
model. There is no real, filterable "Japanese snack box" product to
point a category page's product grid at. Building one would have meant
either fabricating a product line that doesn't exist, or building a
page with an H1 promising something the catalog can't deliver — exactly
what Phase 4 says not to do ("do not create empty category pages just
to target keywords").

The honest equivalent that was built instead: educational guide content
(the blog posts in §1) that targets the same search intent
("Japanese snacks in Kenya", "Korean snacks in Kenya") truthfully,
and is transparent that Snack Quest's box is a multi-country mix, then
funnels to the one real product surface that exists: `/boxes`.

If Snack Quest ever adds real single-origin or origin-taggable
products, genuine category pages become straightforward — the content
and internal-linking structure built in this phase is already shaped to
support that (`getRelatedPosts`, the tag system) and would just need a
`Package.originCountry`-style field and a filtered `/boxes` view.

## 4. Recommended authority-building actions outside the codebase

In rough priority order:

1. **Google Business Profile.** Free, fast, and disproportionately
   effective for a young local brand — Kelvin is already planning this.
2. **Request real reviews** from recent customers (the `/review` page
   already exists for this) — the more real published reviews, the
   stronger the `AggregateRating` schema already wired up on `/reviews`
   becomes automatically. No code change needed to benefit from this.
3. **Send boxes to a handful of real Kenyan food/lifestyle
   TikTok/Instagram accounts** for an honest review. Each real mention
   is both a backlink signal and something an AI system can eventually
   cite.
4. **Pitch a launch story to Kenyan startup/business press** (the
   angle — an M-Pesa-native mystery snack box — is genuinely
   differentiated). `/press` now exists as somewhere to point them.
5. **Local business directories** relevant to Kenya (beyond Google
   Business Profile) — each is a low-effort, legitimate citation.
6. **Participate authentically** in Kenyan online communities where
   snacks/gifting come up — not spam, real participation that
   occasionally links back.

## 5. Exact URLs to submit / request indexing for in Search Console and Bing Webmaster Tools

This session has no API access to either dashboard, so nothing here is
a claim about current indexing status — only what to check, now that
both are verified for `snackquests.shop`.

Submit/re-submit the sitemap first: `https://snackquests.shop/sitemap.xml`

Then use URL Inspection (Search Console) / Submit URL (Bing) on each of
these, since they're either brand-new or meaningfully changed in this
phase:

- `https://snackquests.shop/about`
- `https://snackquests.shop/press`
- `https://snackquests.shop/blog`
- `https://snackquests.shop/blog/what-is-a-mystery-snack-box`
- `https://snackquests.shop/blog/japanese-snacks-in-kenya`
- `https://snackquests.shop/blog/korean-snacks-in-kenya`
- `https://snackquests.shop/blog/japan-korea-china-thailand-snack-differences`
- `https://snackquests.shop/blog/how-to-pay-with-mpesa-online`
- `https://snackquests.shop/faq` (once `npm run faqs:refresh` has run)
- `https://snackquests.shop/reviews`
- `https://snackquests.shop/how-it-works`

Also worth doing once these are indexed: run each through Google's
[Rich Results Test](https://search.google.com/test/rich-results) to
confirm the `Organization`, `AboutPage`, `BlogPosting`, `HowTo`, and
`AggregateRating` structured data validates as expected in a real
Google-facing tool (this session validated the JSON-LD by parsing it in
a browser, which confirms it's well-formed, but not that Google's own
validator agrees on every property).

## 6. What this phase deliberately did not do, and why

- **No bestseller/popularity claims anywhere.** This session had no
  production database credentials — the previous Firebase Admin key
  used earlier in this project's history was flagged for rotation and
  was never reused. Every "no fabricated claims" rule in the brief was
  treated as a hard constraint, not a suggestion: if a fact couldn't be
  verified from the live codebase, it wasn't published. If Kelvin wants
  data-driven content (real top-seller, real category trends), that
  needs either production DB access granted to a session that can
  safely query completed/paid orders only, or Kelvin pulling that data
  himself and handing over the verified numbers.
- **No fake category/shop pages** — see §3.
- **No verification claim on social profile liveness** — see §2. Only
  a check this session could actually perform is reported as done.
- **No paid links, PBNs, fake reviews, fake press, fake statistics,
  fake partnerships, or keyword stuffing** — not attempted, not
  considered, per the brief's explicit prohibition.
