/**
 * The flavour categories every Snack Quest box draws from (§ Mission 2
 * — product pages).
 *
 * Extracted from `WhatsInside.tsx`, which had them inline, so the
 * homepage and the box pages describe the same product from one list
 * rather than two that can drift apart. Presentation stays with each
 * component — the homepage floats these around a photo, a box page
 * lays them out as chips — but the categories themselves live here.
 *
 * These are deliberately *categories*, not contents: what a box will
 * contain a mix of, never a promise that a specific item is in it.
 * That is the honest description of a mystery box, and it is what the
 * FAQ and `llms.txt` already say.
 */
export interface SnackCategory {
  emoji: string;
  label: string;
}

export const SNACK_CATEGORIES: readonly SnackCategory[] = [
  { emoji: '🍫', label: 'Chocolate' },
  { emoji: '🍪', label: 'Crunchy' },
  { emoji: '🍬', label: 'Sweet' },
  { emoji: '🌶️', label: 'Spicy' },
  { emoji: '🥤', label: 'Drinks' },
  { emoji: '✨', label: 'Surprises' },
] as const;

/**
 * Where the snacks come from. Same four countries as
 * `lib/seo/entity.ts`'s `SOURCE_COUNTRIES`, restated here as display
 * copy for the storefront rather than imported, because that module is
 * the SEO/entity description and this is product presentation — they
 * happen to agree today, and neither should silently change the other.
 */
export const SNACK_ORIGIN_COUNTRIES = ['Japan', 'Korea', 'China', 'Thailand'] as const;
