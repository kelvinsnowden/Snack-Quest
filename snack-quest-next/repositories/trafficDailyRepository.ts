import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { VISITOR_IDS_PER_SHARD, type TrafficDaily, type TrafficVisitorShard } from '@/types';

const COLLECTION = 'trafficDaily';
const SHARDS = 'visitorShards';

/**
 * `trafficDaily` reads/writes (§ analytics rollups). Persistence only.
 *
 * Reading a month of traffic is thirty small documents here, against
 * twenty thousand large ones from `pageViews` — and, unlike the query
 * it replaces, it returns an answer computed from every page view
 * rather than from however many of them Firestore happened to return
 * before hitting a cap.
 */
class TrafficDailyRepository {
  private docId(businessId: string, date: string): string {
    return `${businessId}__${date}`;
  }

  /**
   * The rollups covering `[startDate, endDate]` inclusive, by date key.
   *
   * Returns a map rather than a list so the caller can tell a day with
   * no traffic from a day that was never rolled up. Those are different
   * facts and the difference matters: one is a quiet Sunday, the other
   * is a hole in the data.
   */
  async listRange(
    businessId: string,
    startDate: string,
    endDate: string,
  ): Promise<Map<string, TrafficDaily>> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .get();

    const byDate = new Map<string, TrafficDaily>();
    for (const doc of snapshot.docs) {
      const data = doc.data() as TrafficDaily;
      byDate.set(data.date, data);
    }
    return byDate;
  }

  /** Every visitor id recorded for one day, across its shards — the union input for range-level unique visitors. */
  async listVisitorIds(businessId: string, date: string): Promise<string[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .doc(this.docId(businessId, date))
      .collection(SHARDS)
      .get();

    const ids: string[] = [];
    for (const doc of snapshot.docs) {
      ids.push(...((doc.data() as TrafficVisitorShard).ids ?? []));
    }
    return ids;
  }

  /**
   * Write one day's rollup and its visitor shards, replacing whatever
   * was there.
   *
   * Old shards are deleted rather than overwritten: a rebuild after a
   * quieter day would otherwise leave the tail of a busier one behind,
   * and those stale ids would silently inflate unique visitors for
   * every range containing that date.
   */
  async put(
    businessId: string,
    date: string,
    rollup: Omit<TrafficDaily, 'businessId' | 'date' | 'rebuiltAt' | 'visitorShardCount'>,
    visitorIds: string[],
  ): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(this.docId(businessId, date));

    const shards: string[][] = [];
    for (let i = 0; i < visitorIds.length; i += VISITOR_IDS_PER_SHARD) {
      shards.push(visitorIds.slice(i, i + VISITOR_IDS_PER_SHARD));
    }

    const existingShards = await ref.collection(SHARDS).get();
    const writer = adminFirestore.bulkWriter();
    for (const doc of existingShards.docs) {
      if (Number(doc.id) >= shards.length) {
        writer.delete(doc.ref);
      }
    }
    shards.forEach((ids, index) => {
      writer.set(ref.collection(SHARDS).doc(String(index)), { ids } satisfies TrafficVisitorShard);
    });
    writer.set(ref, {
      ...rollup,
      businessId,
      date,
      visitorShardCount: shards.length,
      rebuiltAt: Timestamp.now(),
    } satisfies TrafficDaily);
    await writer.close();
  }
}

export const trafficDailyRepository = new TrafficDailyRepository();
