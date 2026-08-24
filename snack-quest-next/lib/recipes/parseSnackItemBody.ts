import type { SnackItemDraft } from '@/services/recipeService';

/**
 * Shape validation for the snack-item routes, in `lib` because a
 * `route.ts` may only export HTTP handlers. Whether a name is usable or
 * a cost is sane belongs to `RecipeService.validateSnackItem` — one
 * place, so the API and any other caller cannot disagree about what a
 * valid snack is.
 */
export function parseSnackItemBody(body: unknown): { draft: SnackItemDraft } | { error: string } {
  const { name, imageUrl, expectedUnitCostKes, unitLabel, origin, sourcingNote, isActive, availableForPremiumSelection, stockCount } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (typeof name !== 'string') {
    return { error: 'name is required' };
  }
  if (typeof expectedUnitCostKes !== 'number' && typeof expectedUnitCostKes !== 'string') {
    return { error: 'expectedUnitCostKes is required' };
  }

  return {
    draft: {
      name,
      imageUrl: typeof imageUrl === 'string' ? imageUrl : null,
      expectedUnitCostKes: Number(expectedUnitCostKes),
      unitLabel: typeof unitLabel === 'string' ? unitLabel : 'unit',
      origin: typeof origin === 'string' ? origin : null,
      sourcingNote: typeof sourcingNote === 'string' ? sourcingNote : null,
      isActive: isActive !== false,
      // Opt-in: anything but an explicit `true` leaves a snack out of
      // the customer-facing picker.
      availableForPremiumSelection: availableForPremiumSelection === true,
      // `null`/absent means untracked, which is different from 0 — a
      // tracked snack at 0 is hidden from the picker, an untracked one
      // is not. Anything unparseable is treated as untracked rather
      // than silently becoming a stock level nobody set.
      stockCount:
        typeof stockCount === 'number' && Number.isFinite(stockCount) && stockCount >= 0
          ? Math.trunc(stockCount)
          : null,
    },
  };
}
