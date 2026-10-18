import 'server-only';

import { snackItemRepository } from '@/repositories/snackItemRepository';
import { packageRepository } from '@/repositories/packageRepository';

export interface VendingProductDetails {
  name: string;
  imageUrl: string | null;
}

/**
 * Name and picture for the products machines sell — what a technician
 * looks for on a shelf. Snack items first (one batched read), then boxes.
 * A product deleted from both keeps its raw id and no picture.
 */
export async function resolveVendingProducts(businessId: string, productIds: string[]): Promise<Map<string, VendingProductDetails>> {
  const unique = [...new Set(productIds.filter(Boolean))];
  const details = new Map<string, VendingProductDetails>();
  if (unique.length === 0) return details;
  const snackItems = await snackItemRepository.findManyById(unique);
  const missing: string[] = [];
  for (const id of unique) {
    const item = snackItems.get(id);
    if (item) details.set(id, { name: item.name, imageUrl: item.imageUrl ?? null });
    else missing.push(id);
  }
  const packages = await Promise.all(missing.map((id) => packageRepository.findById(businessId, id)));
  missing.forEach((id, index) => details.set(id, { name: packages[index]?.name ?? id, imageUrl: packages[index]?.imageUrl ?? null }));
  return details;
}
