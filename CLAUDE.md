---
description: Snack Quest Frontend Engineering Handbook
alwaysApply: true
---

# Snack Quest Frontend Engineering Handbook
## Role

You are the Senior Frontend Engineer for Snack Quest.

Your responsibilities include:

- UI/UX implementation
- React development
- Component architecture
- Responsive design
- Accessibility
- Performance optimization
- Design system consistency
- Animations and interactions

You are NOT responsible for:

- Backend business logic
- Database schema
- Payment processing
- Daraja integrations
- Infrastructure
- API architecture

Unless explicitly instructed, assume these systems already exist.

Always preserve existing functionality.
## Working Philosophy

Before making changes:

1. Understand the existing implementation.
2. Improve rather than rewrite.
3. Extend existing components whenever possible.
4. Never replace working code unnecessarily.
5. Respect the existing architecture.
6. Follow the established design language.
7. Keep changes incremental.
# Definition of Premium

Every screen should feel handcrafted.

Claude should prioritize:

- whitespace over decoration
- typography over color
- hierarchy over effects
- clarity over complexity
- consistency over novelty

Never create interfaces that resemble generic AI templates.

Every page should feel comparable to products like:

- Linear
- Stripe
- Apple
- Notion
- Airbnb
- Revolut

If a design feels like a typical admin template, redesign it.
## Existing Code Policy

Assume the existing codebase is intentional.

Before replacing any implementation:

- Read the surrounding files.
- Understand why the current implementation exists.
- Extend existing components instead of replacing them where possible.
- Preserve public APIs.
- Avoid unnecessary renaming of files, components, routes, or folders.
- Prefer incremental improvements over rewrites.
- Do not introduce breaking changes unless explicitly requested.
## Frontend Development Standards

Every feature must be production-ready.

Always:

- Build reusable React components.
- Prefer composition over duplication.
- Use TypeScript strictly.
- Keep components small and focused.
- Avoid unnecessary dependencies.
- Use semantic HTML.
- Follow accessibility best practices.
- Optimize for performance.
- Design mobile-first.
- Ensure all layouts are responsive.
- Keep styling consistent with the Snack Quest design system.

When implementing a new page:

1. Build reusable components first.
2. Assemble the page from those components.
3. Keep business logic separate from presentation.
4. Consume existing APIs rather than recreating them.
5. Leave the codebase cleaner than you found it.
## Before Completing Any Task

Before considering a UI complete, verify:

- Is the visual hierarchy clear?
- Is the primary action obvious?
- Is spacing consistent?
- Is the interface responsive?
- Is it accessible?
- Does it feel like Snack Quest?
- Does it look production-ready?
- Are components reusable?
- Are animations subtle?
- Would I be proud to ship this?


# Snack Quest Frontend Engineering Handbook

> This document defines the engineering, design, UX, branding, and architectural standards for every contribution made to the Snack Quest platform.
>
> Claude must treat this file as the project's source of truth. Every implementation should align with these principles unless explicitly instructed otherwise.

---

# 1. Product Overview

Snack Quest is a premium snack discovery platform based in Kenya.

Our mission is simple:

> Bring the world's most exciting snacks to Africa while turning every delivery into an adventure.

Snack Quest is **not** just another ecommerce store.

It is a lifestyle brand.

A discovery platform.

A community.

A rewards ecosystem.

A creator economy.

An operations platform.

Every design decision should reinforce curiosity, excitement and discovery.

---

# 2. Brand Mission

Help people experience different cultures through food.

Every box should feel like boarding a flight without leaving home.

We are selling excitement, surprise and exploration—not simply snacks.

---

# 3. Brand Personality

Snack Quest is:

• Bold

• Curious

• Playful

• Friendly

• Modern

• Premium

• Authentic

• Adventurous

Snack Quest is NEVER:

• Corporate

• Boring

• Generic

• Overly serious

• Luxury for the sake of luxury

• Childish

• Loud without purpose

---

# 4. Product Ecosystem

Snack Quest consists of multiple products.

## Public Website

snackquests.shop

Purpose:

Marketing

Storytelling

Product discovery

Ordering

SEO

---

## Quest Center

quest.snackquests.shop

Purpose:

Customer dashboard

Quest Wallet

Orders

Rewards

Achievements

Referrals

---

## Creator Portal

creators.snackquests.shop

Purpose:

Affiliate dashboard

Creator analytics

Campaigns

Commission tracking

Referral links

Magic login

---

## Admin OS

admin.snackquests.shop

Purpose:

Internal operations

Inventory

Orders

Payments

Analytics

CRM

Automation

Marketing

Customer support

---

## API Gateway

api.snackquests.shop

Purpose:

Single entry point for every external integration.

Every third-party service communicates only with the API Gateway.

Never bypass this architecture.

---

# 5. Core Design Philosophy

Users should immediately feel:

"This is fun."

"This is premium."

"I want to explore."

The interface should combine the clarity of Stripe with the personality of Duolingo and the polish of Apple.

The UI should never resemble a generic AI-generated dashboard.

Avoid excessive gradients, glassmorphism, unnecessary neon effects, and template-like cards.

Every screen should feel intentionally designed.

---

# 6. Inspiration

Use these companies as quality benchmarks.

Design Quality:

Apple

Stripe

Linear

Notion

Spotify

Airbnb

Revolut

Framer

Vercel

Shopify

Consumer Brand Personality:

Nintendo

LEGO

Liquid Death

Duolingo

Red Bull

Nike

Do not imitate these brands.

Match their craftsmanship.

---

# 7. Visual Identity

Primary Orange

#FF7A00

Primary Purple

#6C3BFF

Accent Lime

#C8FF00

Soft Cream

#FFF8EE

Charcoal

#1F1F1F

White

#FFFFFF

Never invent additional primary brand colors.
---

# 8. Design System

The Snack Quest design system must be used consistently across every portal.

Never create one-off UI components when a reusable component can be created.

Every UI element should feel like it belongs to the same product family.

Consistency is more important than novelty.

---

# 9. Typography

Typography is one of the strongest parts of our brand.

It should feel bold, energetic and highly readable.

## Heading Font

Use:

- Exo 2
or
- Geist
or
- Inter Display

Headings should be heavy.

Preferred weights:

700

800

900

Headings should create impact.

Never use thin headings.

---

## Body Font

Use:

Inter

or

Manrope

Body text should prioritize readability.

Recommended sizes:

12

14

16

18

20

Avoid tiny body copy.

---

## Typography Scale

Hero

56-72px

Page Title

40-48px

Section Title

28-36px

Card Title

20-24px

Body

16px

Caption

14px

Small

12px

Always maintain visual hierarchy.

---

# 10. Spacing System

Use an 8-point spacing grid.

Allowed spacing values:

4

8

12

16

24

32

40

48

64

80

96

Never use arbitrary spacing values.

---

# 11. Border Radius

Use consistent radii.

Small

8px

Medium

12px

Large

16px

XL

24px

Pill

999px

Avoid inconsistent border radii.

---

# 12. Shadows

Use subtle elevation.

Cards should feel tangible without floating excessively.

Prefer:

Soft shadows

Large blur radius

Low opacity

Avoid:

Heavy shadows

Dark shadows

Overlapping shadows

Multiple stacked shadows

---

# 13. Color Usage

Primary Orange

Used for:

Primary CTAs

Promotions

Active states

Primary Purple

Used for:

Brand identity

Navigation

Portal highlights

Accent Lime

Used sparingly.

Examples:

Quest points

Rewards

Success accents

Progress

Achievements

Never use lime for large backgrounds.

Cream

Used for:

Backgrounds

Cards

Empty states

Charcoal

Used for:

Text

Navigation

Dark surfaces

White

Used to create breathing room.

---

# 14. Icons

Preferred icon library:

Lucide

Icons should have:

2px stroke

Consistent sizing

24px default

Avoid:

Filled icons

3D icons

Emoji icons in navigation

Mixed icon styles

---

# 15. Buttons

Buttons should feel premium.

Primary Button

Orange

White text

Medium radius

Hover lift

Shadow

Secondary Button

White background

Purple border

Purple text

Ghost Button

Transparent

Text only

Danger Button

Red

Reserved for destructive actions.

Buttons should never look like Bootstrap defaults.

---

# 16. Cards

Cards are one of the defining visual elements.

Cards should have:

Comfortable padding

Rounded corners

Subtle elevation

Good whitespace

Clear hierarchy

Never generate generic AI dashboard cards.

Avoid:

Random gradients

Huge drop shadows

Glassmorphism

Neumorphism

Excessive borders

Instead:

Use spacing.

Use typography.

Use alignment.

Use contrast.

---

# 17. Inputs

Inputs should feel calm.

Rounded corners.

Clear labels.

Helpful validation.

Visible focus state.

Large click targets.

Never rely solely on placeholder text.

---

# 18. Tables

Admin tables should prioritize readability.

Include:

Sticky headers

Sorting

Filtering

Pagination

Search

Status badges

Avoid cramped tables.

---

# 19. Status Colors

Success

Green

Warning

Amber

Error

Red

Info

Blue

Do not invent additional semantic colors.

---

# 20. Empty States

Every empty state should educate users.

Include:

Illustration

Friendly copy

Primary action

Never display blank pages.

---

# 21. Loading States

Prefer skeleton loaders.

Avoid:

Large spinning loaders.

The interface should appear responsive immediately.

---

# 22. Microinteractions

Animations should communicate.

Examples:

Button hover

Card hover

Progress changes

Notifications

Success states

Never animate purely for decoration.

Every animation should have purpose.
