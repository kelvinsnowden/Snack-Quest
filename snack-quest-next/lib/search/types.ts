export type SearchResultType =
  | 'order'
  | 'customer'
  | 'product'
  | 'inventory'
  | 'supplier'
  | 'purchaseOrder'
  | 'conversation'
  | 'creator';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export const SEARCH_RESULT_TYPE_LABELS: Record<SearchResultType, string> = {
  order: 'Orders',
  customer: 'Customers',
  product: 'Products',
  inventory: 'Inventory',
  supplier: 'Suppliers',
  purchaseOrder: 'Purchase orders',
  conversation: 'Conversations',
  creator: 'Creators',
};

/** Case-insensitive substring match — the same simple, honest standard `pickupStations/search.ts` uses before falling back to fuzzy scoring; Global Search stays substring-only (no fuzzy layer) since every field here is short and exact-ish (names, phone numbers, ids), unlike a free-text station name a customer might misspell. */
export function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return fields.some((field) => field && field.toLowerCase().includes(normalized));
}
