import 'server-only';

import { snackItemRepository } from '@/repositories/snackItemRepository';
import { packageRepository } from '@/repositories/packageRepository';

/**
 * Display names for the products machines sell — snack items first (one
 * batched read), then boxes for whatever is left. A product deleted from
 * both keeps its raw id, never a made-up label.
 */
export async function resolveVendingProductNames(businessId: string, productIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(productIds)];
  const names = new Map<string, string>();
  if (unique.length === 0) {
    return names;
  }
  const snackItems = await snackItemRepository.findManyById(unique);
  const missing: string[] = [];
  for (const id of unique) {
    const item = snackItems.get(id);
    if (item) {
      names.set(id, item.name);
    } else {
      missing.push(id);
    }
  }
  if (missing.length > 0) {
    const packages = await Promise.all(missing.map((id) => packageRepository.findById(businessId, id)));
    missing.forEach((id, index) => {
      names.set(id, packages[index]?.name ?? id);
    });
  }
  return names;
}
