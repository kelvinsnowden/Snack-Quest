/**
 * Shared class strings for the home page's pill-shaped CTAs (§
 * jungle-adventure landing page rebuild) — centralized so the same
 * primary-action visual treatment used across ~9 CTAs never
 * drifts between instances. The base `Button` component is
 * `rounded-md` by default; these override to the pill shape this
 * page's brand language calls for via the existing `--radius-full`
 * token, without adding a new Button variant only one page uses.
 */
export const PRIMARY_CTA_CLASS =
  'rounded-full bg-gradient-to-br from-primary to-home-orange-glow shadow-[0_20px_60px_-15px_rgb(255_122_0/0.5)] transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_30px_70px_-15px_rgb(255_122_0/0.65)] active:translate-y-0 active:scale-[0.99]';

export const GHOST_CTA_CLASS =
  'rounded-full bg-background text-foreground shadow-none transition-all duration-300 hover:bg-white hover:shadow-sm';
