# Creator Content Master Map

Companion to `CREATOR_ECONOMY_STRATEGY.md` (the narrative strategy —
opportunity, competitors, funnel, off-site plan) — this is the tactical
map: every pillar in scope, what's built, what's next, and exactly how
each piece links to the rest.

Research basis for this pass (live web search, in addition to the
searches already logged in `CREATOR_ECONOMY_STRATEGY.md`): TikTok
Creator Rewards Program eligibility, TikTok monetization in Kenya,
TikTok Shop Kenya availability, WhatsApp Status/business monetization
Kenya, and brand-deal pricing/media-kit methodology for small creators.
Findings that change what gets written, flagged clearly as evidence,
not assumption:

- **TikTok's own Creator Rewards Program is not available to
  Kenya-registered accounts.** Its documented eligible countries are
  the US, UK, Germany, Japan, South Korea, France, Mexico, and Brazil.
  A Kenyan creator cannot qualify for it regardless of follower count
  or views — this must be stated plainly, not glossed over the way
  generic "how to make money on TikTok" content often does.
- **TikTok Shop's status in Kenya is genuinely unsettled** as of this
  writing — some sources describe it as live, others list Kenya as
  "expected to be added next." Any mention of it must be hedged and
  point the reader to TikTok's own current Seller Center rather than
  state a firm yes/no.
- Real, currently-available TikTok monetization paths for Kenyan
  creators: Live Gifts (paid out via Pesapal/M-Pesa), brand
  partnerships, affiliate marketing, and using TikTok to route an
  audience to other monetizable channels (WhatsApp, a referral link).
- "Get paid to post/view WhatsApp Status" schemes appear across
  several Kenyan sites and read as exactly the low-trust content
  pattern this strategy is meant to avoid emulating — not used as a
  basis for the WhatsApp article. The real, legitimate WhatsApp
  monetization paths are: WhatsApp Business catalogs, Status as a free
  organic promotion channel, and sharing an affiliate/referral link
  with a trusted audience (all standard business use, not a "get paid
  to view ads" gimmick).
- No reliable Kenya-specific brand-deal rate card exists anywhere
  found. Global sources describe a per-follower/engagement pricing
  *methodology*, not a number that transfers honestly to Kenya — so
  the brand-deals content teaches the methodology (media kit, pitch
  cadence, deliverable-based pricing) rather than quoting a KES figure.

## Pillars, status, and priority

| Pillar | Status | Priority this pass |
|---|---|---|
| A — Creator monetization (general) | Partially covered (small-audience article) | Covered |
| B — TikTok monetization | **Built this pass** | Tier 1 |
| C — Instagram monetization | Not built | Tier 2 |
| D — UGC | Built (prior phase) | Covered |
| E — Brand deals | **Built this pass** | Tier 1 |
| F — Affiliate marketing | Built (prior phase) | Covered |
| G — WhatsApp monetization | **Built this pass** | Tier 1 |
| H — Small-creator monetization | Built (prior phase, `small-audience`) | Covered |
| I — Creator education (start/create/grow) | Not built | Tier 3 |

## Article map

Columns: intent, funnel stage (TOFU/MOFU/BOFU), priority tier,
internal links, CTA, URL, schema. "Built" = live in this codebase now.

| Article | Intent | Funnel | Tier | Internal links | CTA | URL | Schema |
|---|---|---|---|---|---|---|---|
| **Can you make money with 500/1,000 followers in Kenya?** *(built, prior phase)* | Reassure + educate small creators | TOFU/MOFU | 1 | → UGC, → affiliate-marketing, → brand-deals (new) | Join Creator Program | `/creators/academy/small-audience` | Article + FAQPage |
| **How to become a UGC creator in Kenya** *(built, prior phase)* | Explain UGC vs influencer, remove follower barrier | TOFU/MOFU | 1 | → small-audience, → mystery-box blog post, → brand-deals (new) | Join Creator Program | `/creators/academy/ugc-kenya` | Article + FAQPage |
| **How affiliate marketing actually works in Kenya** *(built, prior phase)* | Explain the mechanism, position M-Pesa payout as an advantage | MOFU | 1 | → small-audience | Join Creator Program | `/creators/academy/affiliate-marketing-kenya` | Article + FAQPage |
| **How to make money on TikTok in Kenya** *(built this pass)* | Correct the record on what's actually available (Creator Rewards ineligibility), point to real paths | TOFU/MOFU | 1 | → affiliate-marketing, → ugc-kenya, → whatsapp-kenya (new) | Join Creator Program | `/creators/academy/tiktok-kenya` | Article + FAQPage |
| **How to get your first brand deal in Kenya** *(built this pass)* | Teach pricing methodology + media kit, not a fabricated rate card | MOFU/BOFU | 1 | → ugc-kenya, → small-audience | Join Creator Program | `/creators/academy/brand-deals-kenya` | Article + FAQPage |
| **How Kenyan creators can monetize WhatsApp** *(built this pass)* | Real WhatsApp mechanics, avoid the "paid to view Status" scheme pattern | MOFU | 1 | → affiliate-marketing, → small-audience | Join Creator Program | `/creators/academy/whatsapp-kenya` | Article + FAQPage |
| How to make money on Instagram in Kenya | Platform-specific parallel to TikTok, differentiated content | TOFU/MOFU | 2 | → ugc-kenya, → brand-deals, → tiktok-kenya | Join Creator Program | `/creators/academy/instagram-kenya` | Article + FAQPage |
| How to build a creator media kit (standalone deep-dive) | Practical template/checklist, split out once brand-deals traffic justifies it | MOFU | 2 | → brand-deals-kenya | Join Creator Program | `/creators/academy/media-kit` | Article |
| How to make your first UGC video (practical walkthrough) | Deeper, more tactical than the UGC pillar page | TOFU | 2 | → ugc-kenya | Join Creator Program | *(fold into ugc-kenya unless real demand emerges for a split)* | — |
| How to negotiate a brand deal / recurring work | Deeper BOFU tactic for creators already landing deals | BOFU | 3 | → brand-deals-kenya | Join Creator Program | `/creators/academy/negotiating-brand-deals` | Article |
| Start/Create/Grow foundational guides (niche choice, first 10 videos, hooks, analytics) | Broad TOFU education | TOFU | 3 | → relevant Tier 1 monetization articles | Explore the Academy | `/creators/academy/{slug}` per topic | Article |
| Kenya Creator Monetization Report | Original-research authority asset | TOFU (PR-driven) | 3 (data-gated) | → all monetization articles | Join Creator Program | `/creators/academy/report` (if built) | Article/Report |

Tier 2/3 items are intentionally not built this pass — sequenced in
`CREATOR_ECONOMY_STRATEGY.md`'s 30/60/90 roadmap, which this map
extends rather than replaces.

## Recommended URL architecture (unchanged, confirmed still correct)

```
/creators                                   → conversion (unchanged)
/creators/academy                           → pillar hub
  /creators/academy/small-audience           (built)
  /creators/academy/ugc-kenya                (built)
  /creators/academy/affiliate-marketing-kenya (built)
  /creators/academy/tiktok-kenya             (built this pass)
  /creators/academy/brand-deals-kenya        (built this pass)
  /creators/academy/whatsapp-kenya           (built this pass)
  /creators/academy/instagram-kenya          (Tier 2)
  /creators/academy/media-kit                (Tier 2)
  /creators/academy/negotiating-brand-deals  (Tier 3)
```

No separate `/creators/tiktok`, `/creators/ugc` etc. top-level
routes — everything creator-education-related nests under
`/creators/academy/*`, keeping `/creators` itself as the one clean
conversion page and giving the whole cluster one clear parent in both
the URL structure and the breadcrumb trail.
