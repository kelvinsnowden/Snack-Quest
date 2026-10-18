/**
 * Everything a rider carries on one trip, as one list: each product once,
 * with the total to take off the shelf and how it splits between the
 * machines on the round. Packing a whole round from one list is quicker
 * than packing machine by machine, and nothing is packed twice.
 */
export interface TripPackInput {
  machineId: string;
  machineCode: string;
  lines: { slotCode: string; productId: string | null; name: string; imageUrl: string | null; quantity: number }[];
}

export interface TripPackProduct {
  /** The product id, or `slot:<machine>:<slot>` for a line with no product (it can't be merged with anything). */
  key: string;
  name: string;
  imageUrl: string | null;
  quantity: number;
  machines: { machineId: string; machineCode: string; quantity: number; slots: string[] }[];
}

export function tripPackList(restocks: TripPackInput[]): { products: TripPackProduct[]; totalItems: number } {
  const byProduct = new Map<string, TripPackProduct>();
  for (const restock of restocks) {
    for (const line of restock.lines) {
      if (line.quantity <= 0) continue;
      const key = line.productId ?? `slot:${restock.machineId}:${line.slotCode}`;
      const product = byProduct.get(key) ?? { key, name: line.name, imageUrl: line.imageUrl, quantity: 0, machines: [] };
      product.quantity += line.quantity;
      const machine = product.machines.find((entry) => entry.machineId === restock.machineId);
      if (machine) {
        machine.quantity += line.quantity;
        machine.slots.push(line.slotCode);
      } else {
        product.machines.push({ machineId: restock.machineId, machineCode: restock.machineCode, quantity: line.quantity, slots: [line.slotCode] });
      }
      byProduct.set(key, product);
    }
  }
  const products = [...byProduct.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { products, totalItems: products.reduce((sum, product) => sum + product.quantity, 0) };
}
