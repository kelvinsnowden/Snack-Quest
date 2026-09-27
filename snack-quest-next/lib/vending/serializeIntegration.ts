/**
 * Converts Firestore `Timestamp`s (anything with `toDate()`) to ISO
 * strings, recursively — for the admin integration console's API
 * responses, whose shapes nest timestamps several levels deep
 * (signals, stage history, checklists, status history). Same purpose as
 * `lib/vending/serialize.ts`, applied generically because these are
 * admin-only views of registry records, not the partner-facing shapes
 * that file deliberately hand-picks fields for.
 */
export function toJsonSafe(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value ?? null;
  }
  if (typeof value === 'object' && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(toJsonSafe);
  }
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, toJsonSafe(entry)]));
  }
  return value;
}
