# ADR-0000: Rebuild the presentation layer instead of porting it

## Status

Accepted.

## Context

`MIGRATION_PLAN.md` §1 and `TECHNICAL_DESIGN_DOCUMENT.md` §14 (as
originally written) both treated the current Vite app's screens as
largely portable: port the shared primitives with a `'use client'`
directive and import-path audit, and mirror the portal-specific
components (`src/components/creator/*`, `quest-center/*`, admin domain
folders) "same organization principle, same files, new home."

That plan was reasonable given the goal at the time (preserve as much
work as possible while migrating the data/auth layer), but the current
screens — including the portal-specific components and page
compositions — originate from the project's original AI Studio/Gemini
scaffold, not from a deliberate design process. Phase 0 (scaffolding,
Firebase integration, the data model, the Repository/Service layers,
security rules) is now complete and stable. Continuing to port that
generated presentation layer forward, verbatim, would carry its
unexamined design decisions into the rebuilt app rather than taking the
migration as the opportunity it is to apply the project's actual design
system and the available design-focused skills.

## Decision

**Fixed — not affected by this ADR, not to be redesigned:**
Firebase/Firestore schema (§8), the Repository layer (§4), the Service
layer (§4), the authentication architecture (§6), Firestore Security
Rules (§9), the folder structure (§13), API contracts (§10), and the
domain models (`types/`, §8).

**Open for rebuild — the entire presentation layer, from first
principles:** pages, layouts, navigation, components, interactions,
animations, responsive behavior, accessibility, and visual design.
"From first principles" means using the project's design system and
design-focused skills to reach production-quality UX — not copying the
current Vite/Gemini app's markup, layout, or visual treatment. The
current screens are reference material for business requirements and
existing functionality only.

- **Screens are rebuilt, not ported.** All page layouts, dashboards,
  navigation, interactions, animations, responsive behavior, and
  accessibility are designed from first principles using the project's
  design system and the available design-focused skills, not copied
  from the current Vite app's page compositions. Existing screens are
  reference material only — useful for understanding business
  requirements and existing functionality, not a source to port
  markup/visuals from.
- **Shared UI primitives are infrastructure, not product UI, and are
  not frozen.** The Phase 0-ported primitives
  (`components/ui/{StatCard,FormField,PillTabs,Modal,StatusBadge,
  EmptyState,ErrorState,DataTable,ChartWrapper}.tsx`) remain the
  starting foundation — they are not being thrown out. But they are not
  preserved for their own sake either: any primitive can be redesigned
  or refactored when doing so improves API consistency, accessibility,
  composability, or visual quality. There is no obligation to keep
  Gemini-era styling.

## Consequences

- `TECHNICAL_DESIGN_DOCUMENT.md` §14 (Component Architecture) is updated
  to describe this split (primitives: foundation, evolvable; screens:
  rebuilt) instead of "port verbatim."
- `MIGRATION_PLAN.md` §1's claim that presentational components "port
  with two mechanical changes... No logic rewrite" is superseded by this
  ADR for anything above the primitive layer; `MIGRATION_PLAN.md` itself
  is left as a historical record with a pointer to this ADR rather than
  rewritten, per this document's own philosophy (§25 of the TDD: a
  superseded decision gets a new ADR that links back, the prior one
  stays as the record of why that choice was made at the time).
- Every future phase in `IMPLEMENTATION_GUIDE.md` (§23 of the TDD) that
  previously said "reuse nearly all of `src/components/creator/*`" (or
  equivalent for other portals) instead designs and builds that portal's
  screens fresh, using the primitives as building blocks.
- This changes scope and effort upward for every future phase's UI work
  — screens are designed, not copied — which is an accepted, deliberate
  trade-off in exchange for a presentation layer that's actually
  intentional rather than inherited.
