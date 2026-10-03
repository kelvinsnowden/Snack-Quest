import 'server-only';

import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AdCampaign, AdCreative, AdDailyStat, AdPlaybackEventType, AdRevenueEntry, Advertiser } from '@/types/advertising';

const ADVERTISERS = 'advertisers';
const CREATIVES = 'adCreatives';
const CAMPAIGNS = 'adCampaigns';
const BATCHES = 'adPlaybackBatches';
const STATS = 'adDailyStats';
const REVENUE = 'adRevenueEntries';

export class AdNotFoundError extends Error {
  constructor(what: string, id: string) {
    super(`${what} ${id} not found`);
    this.name = 'AdNotFoundError';
  }
}

type Row<T> = { id: string; data: T };

async function ownDoc<T extends { businessId: string }>(collection: string, businessId: string, id: string): Promise<T | null> {
  const snapshot = await adminFirestore.collection(collection).doc(id).get();
  const data = snapshot.data() as T | undefined;
  return data && data.businessId === businessId ? data : null;
}

export function playbackBatchId(machineId: string, batchId: string): string {
  return createHash('sha256').update(`${machineId}\u0000${batchId}`).digest('hex').slice(0, 40);
}

export interface NewPlaybackEvent {
  campaignId: string;
  creativeId: string;
  eventType: AdPlaybackEventType;
  clientEventId: string;
  occurredAt: Date;
  playedMs: number | null;
  failureReason: string | null;
}

/**
 * `advertisers`, `adCreatives`, `adCampaigns`, `adPlaybackBatches`,
 * `adDailyStats` and `adRevenueEntries`. Every read checks `businessId`;
 * a document from another tenant reads as not found.
 */
class AdvertisingRepository {
  // Advertisers
  async createAdvertiser(input: Omit<Advertiser, 'createdAt' | 'updatedAt'>): Promise<string> {
    const now = FieldValue.serverTimestamp();
    return (await adminFirestore.collection(ADVERTISERS).add({ ...input, createdAt: now, updatedAt: now })).id;
  }

  async findAdvertiser(businessId: string, id: string): Promise<Advertiser | null> {
    return ownDoc<Advertiser>(ADVERTISERS, businessId, id);
  }

  async updateAdvertiser(businessId: string, id: string, fields: Partial<Pick<Advertiser, 'name' | 'contactName' | 'contactEmail' | 'contactPhone' | 'notes' | 'active'>>): Promise<void> {
    if (!(await this.findAdvertiser(businessId, id))) throw new AdNotFoundError('Advertiser', id);
    await adminFirestore.collection(ADVERTISERS).doc(id).update({ ...fields, updatedAt: FieldValue.serverTimestamp() });
  }

  async listAdvertisers(businessId: string): Promise<Row<Advertiser>[]> {
    const snapshot = await adminFirestore.collection(ADVERTISERS).where('businessId', '==', businessId).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as Advertiser }));
  }

  // Creatives
  async createCreative(input: Omit<AdCreative, 'createdAt' | 'updatedAt' | 'reviewedAt'> & { reviewedAt: null }): Promise<string> {
    const now = FieldValue.serverTimestamp();
    return (await adminFirestore.collection(CREATIVES).add({ ...input, createdAt: now, updatedAt: now })).id;
  }

  async findCreative(businessId: string, id: string): Promise<AdCreative | null> {
    return ownDoc<AdCreative>(CREATIVES, businessId, id);
  }

  async findCreatives(businessId: string, ids: string[]): Promise<Map<string, AdCreative>> {
    const found = new Map<string, AdCreative>();
    const unique = [...new Set(ids)];
    if (unique.length === 0) return found;
    const snapshots = await adminFirestore.getAll(...unique.map((id) => adminFirestore.collection(CREATIVES).doc(id)));
    for (const snapshot of snapshots) {
      const data = snapshot.data() as AdCreative | undefined;
      if (data && data.businessId === businessId) found.set(snapshot.id, data);
    }
    return found;
  }

  async listCreatives(businessId: string): Promise<Row<AdCreative>[]> {
    const snapshot = await adminFirestore.collection(CREATIVES).where('businessId', '==', businessId).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as AdCreative }));
  }

  /** Review is a transaction: two reviewers acting at once can't both decide from the same starting state. */
  async reviewCreative(businessId: string, id: string, decide: (current: AdCreative) => Pick<AdCreative, 'status' | 'reviewNote' | 'reviewedBy'>): Promise<{ before: AdCreative; after: Pick<AdCreative, 'status' | 'reviewNote' | 'reviewedBy'> }> {
    const ref = adminFirestore.collection(CREATIVES).doc(id);
    return adminFirestore.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const current = snapshot.data() as AdCreative | undefined;
      if (!current || current.businessId !== businessId) throw new AdNotFoundError('Creative', id);
      const next = decide(current);
      tx.update(ref, { ...next, reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return { before: current, after: next };
    });
  }

  // Campaigns
  async createCampaign(input: Omit<AdCampaign, 'createdAt' | 'updatedAt' | 'publishedAt' | 'publishedBy'>): Promise<string> {
    const now = FieldValue.serverTimestamp();
    return (await adminFirestore.collection(CAMPAIGNS).add({ ...input, publishedAt: null, publishedBy: null, createdAt: now, updatedAt: now })).id;
  }

  async findCampaign(businessId: string, id: string): Promise<AdCampaign | null> {
    return ownDoc<AdCampaign>(CAMPAIGNS, businessId, id);
  }

  async listCampaigns(businessId: string): Promise<Row<AdCampaign>[]> {
    const snapshot = await adminFirestore.collection(CAMPAIGNS).where('businessId', '==', businessId).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as AdCampaign }));
  }

  async listActiveCampaigns(businessId: string): Promise<Row<AdCampaign>[]> {
    const snapshot = await adminFirestore.collection(CAMPAIGNS).where('businessId', '==', businessId).where('status', '==', 'active').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as AdCampaign }));
  }

  /** Read-check-write in a transaction, so a status change is judged against the campaign as it is at that moment. */
  async mutateCampaign(businessId: string, id: string, change: (current: AdCampaign) => Partial<AdCampaign>): Promise<{ before: AdCampaign; after: Partial<AdCampaign> }> {
    const ref = adminFirestore.collection(CAMPAIGNS).doc(id);
    return adminFirestore.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const current = snapshot.data() as AdCampaign | undefined;
      if (!current || current.businessId !== businessId) throw new AdNotFoundError('Campaign', id);
      const next = change(current);
      tx.update(ref, { ...next, updatedAt: FieldValue.serverTimestamp() });
      return { before: current, after: next };
    });
  }

  // Playback
  /**
   * Stores a machine's batch and counts its events in the daily stats, in
   * one transaction. A batch already stored (same machine, same batch id)
   * is a duplicate and changes nothing; within a batch, a repeated client
   * event id counts once.
   */
  async recordBatch(businessId: string, machineId: string, batchId: string, date: string, packageVersion: string | null, events: NewPlaybackEvent[]): Promise<{ accepted: number; duplicates: number; duplicateBatch: boolean }> {
    const ref = adminFirestore.collection(BATCHES).doc(playbackBatchId(machineId, batchId));
    const unique: NewPlaybackEvent[] = [];
    const seen = new Set<string>();
    for (const event of events) {
      if (seen.has(event.clientEventId)) continue;
      seen.add(event.clientEventId);
      unique.push(event);
    }
    return adminFirestore.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) return { accepted: 0, duplicates: events.length, duplicateBatch: true };
      tx.create(ref, {
        businessId,
        machineId,
        batchId,
        date,
        packageVersion,
        events: unique.map((event) => ({ ...event, occurredAt: Timestamp.fromDate(event.occurredAt) })),
        receivedAt: FieldValue.serverTimestamp(),
      });
      const increments = new Map<string, { campaignId: string; counts: Record<string, number> }>();
      for (const event of unique) {
        const statId = `${businessId}_${date}_${event.campaignId}_${machineId}`;
        const entry = increments.get(statId) ?? { campaignId: event.campaignId, counts: {} };
        entry.counts[event.eventType] = (entry.counts[event.eventType] ?? 0) + 1;
        if (event.eventType === 'completed') entry.counts.playedMs = (entry.counts.playedMs ?? 0) + (event.playedMs ?? 0);
        increments.set(statId, entry);
      }
      for (const [statId, { campaignId, counts }] of increments) {
        const fields: Record<string, unknown> = { businessId, date, campaignId, machineId, updatedAt: FieldValue.serverTimestamp() };
        for (const [key, value] of Object.entries(counts)) if (value !== 0) fields[key] = FieldValue.increment(value);
        tx.set(adminFirestore.collection(STATS).doc(statId), fields, { merge: true });
      }
      return { accepted: unique.length, duplicates: events.length - unique.length, duplicateBatch: false };
    });
  }

  async listStats(businessId: string, fromDate: string, toDate: string, filter: { campaignId?: string } = {}): Promise<AdDailyStat[]> {
    let query = adminFirestore.collection(STATS).where('businessId', '==', businessId).where('date', '>=', fromDate).where('date', '<=', toDate);
    if (filter.campaignId) query = query.where('campaignId', '==', filter.campaignId);
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => doc.data() as AdDailyStat);
  }

  async listStatsForMachines(businessId: string, machineIds: string[], fromDate: string, toDate: string): Promise<AdDailyStat[]> {
    const rows: AdDailyStat[] = [];
    for (let i = 0; i < machineIds.length; i += 30) {
      const snapshot = await adminFirestore
        .collection(STATS)
        .where('businessId', '==', businessId)
        .where('machineId', 'in', machineIds.slice(i, i + 30))
        .where('date', '>=', fromDate)
        .where('date', '<=', toDate)
        .get();
      rows.push(...snapshot.docs.map((doc) => doc.data() as AdDailyStat));
    }
    return rows;
  }

  // Revenue
  async saveRevenueEntry(businessId: string, entry: Omit<AdRevenueEntry, 'computedAt'>): Promise<void> {
    await adminFirestore
      .collection(REVENUE)
      .doc(`${businessId}_${entry.campaignId}_${entry.month}`)
      .set({ ...entry, computedAt: FieldValue.serverTimestamp() });
  }

  async listRevenue(businessId: string, month: string): Promise<AdRevenueEntry[]> {
    const snapshot = await adminFirestore.collection(REVENUE).where('businessId', '==', businessId).where('month', '==', month).get();
    return snapshot.docs.map((doc) => doc.data() as AdRevenueEntry);
  }
}


export const advertisingRepository = new AdvertisingRepository();
