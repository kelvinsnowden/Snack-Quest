/**
 * Whole-KES equal split across a fulfillment batch's orders (§
 * Fulfillment Batches — "Do NOT over-engineer this. Simple equal
 * allocation is enough"). Floor-divides, then gives the first
 * `remainder` orders — in the order `orderIds` was given, i.e.
 * selection order — one extra shilling each, so the result always
 * sums to exactly `totalCostKes` for any input. No fractional
 * shillings invented or silently dropped.
 *
 * Pure and Firestore-free so it can run identically on the client (a
 * live preview while the admin is still filling in costs) and on the
 * server (the authoritative write) — the number previewed is
 * provably the number saved.
 */
export function allocateEqualSplit(totalCostKes: number, orderIds: string[]): Record<string, number> {
  const n = orderIds.length;
  const base = Math.floor(totalCostKes / n);
  const remainder = totalCostKes - base * n;
  const result: Record<string, number> = {};
  orderIds.forEach((id, index) => {
    result[id] = base + (index < remainder ? 1 : 0);
  });
  return result;
}
