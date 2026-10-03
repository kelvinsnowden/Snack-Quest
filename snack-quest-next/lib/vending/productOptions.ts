import 'server-only';

import { snackItemRepository } from '@/repositories/snackItemRepository';
import { packageRepository } from '@/repositories/packageRepository';

export interface ProductOption {
  productCatalogue: 'snackItem' | 'package';
  productId: string;
  name: string;
  active: boolean;
}

/** Every snack and box a machine could carry, snacks first, alphabetical — for the slot and catalogue pickers. Inactive ones are included (flagged) so an existing slot's product always has a name. */
export async function listProductOptions(businessId: string): Promise<ProductOption[]> {
  const [snacks, packages] = await Promise.all([snackItemRepository.listByBusiness(businessId), packageRepository.listAllByBusiness(businessId)]);
  return [
    ...snacks.map(({ id, data }) => ({ productCatalogue: 'snackItem' as const, productId: id, name: data.name, active: data.isActive })),
    ...packages.map(({ id, data }) => ({ productCatalogue: 'package' as const, productId: id, name: `${data.name} (box)`, active: data.isActive })).sort((a, b) => a.name.localeCompare(b.name)),
  ];
}
