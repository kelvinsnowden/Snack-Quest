import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { MACHINE_SALES_DAY_VERSION, machineSalesDayDocId, type MachineSalesDay } from '@/types';

const COLLECTION = 'machineSalesDaily';
/** Documents per batched read or write. */
const CHUNK = 300;

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let at = 0; at < items.length; at += CHUNK) out.push(items.slice(at, at + CHUNK));
  return out;
}

/**
 * `machineSalesDaily` reads and writes. Read by document id, never by
 * query, so it needs no index — a new collection works the moment it ships,
 * without waiting for an index to build.
 */
class MachineSalesDayRepository {
  /** The stored summaries of these days that are of the current version, by date. A day missing from the result has none. */
  async getMany(businessId: string, machineId: string, dates: string[]): Promise<Map<string, MachineSalesDay>> {
    const found = new Map<string, MachineSalesDay>();
    if (dates.length === 0) return found;
    const batches = await Promise.all(chunks(dates).map((part) => adminFirestore.getAll(...part.map((date) => adminFirestore.collection(COLLECTION).doc(machineSalesDayDocId(machineId, date))))));
    for (const snapshot of batches.flat()) {
      const data = snapshot.data() as MachineSalesDay | undefined;
      if (data && data.businessId === businessId && data.machineId === machineId && data.version === MACHINE_SALES_DAY_VERSION) found.set(data.date, data);
    }
    return found;
  }

  /** Replaces each day's summary whole, so writing one twice changes nothing. */
  async putMany(days: Omit<MachineSalesDay, 'version' | 'builtAt'>[]): Promise<void> {
    const builtAt = Timestamp.now();
    await Promise.all(
      chunks(days).map((part) => {
        const batch = adminFirestore.batch();
        for (const day of part) {
          batch.set(adminFirestore.collection(COLLECTION).doc(machineSalesDayDocId(day.machineId, day.date)), { ...day, version: MACHINE_SALES_DAY_VERSION, builtAt });
        }
        return batch.commit();
      }),
    );
  }
}

export const machineSalesDayRepository = new MachineSalesDayRepository();
