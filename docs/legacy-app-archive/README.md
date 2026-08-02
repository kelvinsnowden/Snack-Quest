# Legacy application archive

These five documents describe the original AI Studio/Gemini-generated Vite +
Express application that used to live at the repository root (`src/`,
`server.ts`, `dist/`, and related config). That application has been
**deleted from this repository**. It is not a dependency of, and was never
imported by, `snack-quest-next/` — confirmed by a full audit before removal.

Per `docs/adr/0000-ui-rebuild.md`'s own stated philosophy ("a superseded
decision gets a new ADR that links back, the prior one stays as the record
of why that choice was made at the time"), these documents are kept as a
historical record of the pre-`snack-quest-next` system's real behavior and
known defects — not as a source to port code or patterns from, and not as
documentation of anything currently running.

- `ARCHITECTURE_REPORT.md` — the original security/architecture findings on
  the legacy Express app (no working auth anywhere, no Firebase wiring).
- `ARCHITECTURAL_BLUEPRINT.md` — the legacy app's own self-description
  (includes at least one confirmed AI-hallucinated claim).
- `CREATOR_PORTAL_TECH_DEBT.md` — specific, confirmed bugs in the legacy
  Creator Portal (e.g. the withdrawal-identity misattribution bug).
- `MIGRATION_PLAN.md` — the original (superseded) plan to port the legacy
  UI forward; superseded by ADR-0000's decision to rebuild from scratch.
- `ARCHITECTURE_COMPLETENESS_AUDIT.md` — a TDD-completeness audit performed
  against the legacy `server.ts`, before the WhatsApp-commerce backend in
  `snack-quest-next/` existed.

`snack-quest-next/` is the only application in this repository going
forward. `TECHNICAL_DESIGN_DOCUMENT.md`, `PLATFORM_ARCHITECTURE_V2.md`, and
`IMPLEMENTATION_GUIDE.md` (repo root) remain the live, authoritative
architecture documents for it.
