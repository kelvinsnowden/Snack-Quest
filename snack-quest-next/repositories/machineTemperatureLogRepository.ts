import 'server-only';

import { FieldPath } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { temperatureLogDocId, type TemperatureLogRow } from '@/lib/vending/temperatureLog';

const COLLECTION = 'machineTemperatureLog';

/**
 * `machineTemperatureLog/{machineId}_{YYYYMMDDHH}` — one finished hour of
 * a machine's temperature record, written by
 * `machineIntegrationRepository.setLastReportedStatus`. Read by document
 * id range, so a machine's hours come back in order without an index.
 */
class MachineTemperatureLogRepository {
  async listRange(businessId: string, machineId: string, fromMs: number, toMs: number, limit = 24 * 400): Promise<TemperatureLogRow[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .orderBy(FieldPath.documentId())
      .startAt(temperatureLogDocId(machineId, fromMs))
      .endBefore(temperatureLogDocId(machineId, toMs))
      .limit(limit)
      .get();
    return snapshot.docs
      .map((doc) => doc.data() as TemperatureLogRow & { businessId: string; machineId: string })
      // Ids are per machine; the business check keeps one tenant's rows out of another's even on an id collision.
      .filter((row) => row.businessId === businessId && row.machineId === machineId)
      .map(({ hourStartMs, minCelsius, maxCelsius, avgCelsius, samples }) => ({ hourStartMs, minCelsius, maxCelsius, avgCelsius, samples }));
  }
}

export const machineTemperatureLogRepository = new MachineTemperatureLogRepository();
