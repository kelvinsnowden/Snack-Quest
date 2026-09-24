import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import {
  RECOMMENDATION_STATUS_TRANSITIONS,
  type IntelligenceRecommendation,
  type RecommendationStatus,
  type RecommendationType,
} from '@/types';

const COLLECTION = 'intelligenceRecommendations';

export type IntelligenceRecommendationInput = Omit<IntelligenceRecommendation, 'createdAt' | 'updatedAt' | 'deletedAt' | 'updatedBy'>;

export class RecommendationNotFoundError extends Error {
  constructor(recommendationId: string) {
    super(`Recommendation ${recommendationId} not found`);
    this.name = 'RecommendationNotFoundError';
  }
}

export class IllegalRecommendationTransitionError extends Error {
  constructor(from: RecommendationStatus, to: RecommendationStatus) {
    super(`Cannot move a recommendation from "${from}" to "${to}"`);
    this.name = 'IllegalRecommendationTransitionError';
  }
}

export class RecommendationNotApprovedError extends Error {
  constructor(recommendationId: string, status: RecommendationStatus) {
    super(`Recommendation ${recommendationId} is "${status}" — an outcome can only be recorded once it has been approved and acted on`);
    this.name = 'RecommendationNotApprovedError';
  }
}

/** `intelligenceRecommendations` reads/writes (§ RECOMMENDATION ENGINE). */
class IntelligenceRecommendationRepository {
  async create(input: IntelligenceRecommendationInput): Promise<string> {
    const now = FieldValue.serverTimestamp();
    const ref = await adminFirestore.collection(COLLECTION).add({
      ...input,
      createdAt: now,
      updatedAt: now,
      updatedBy: input.createdBy,
      deletedAt: null,
    });
    return ref.id;
  }

  async findById(businessId: string, recommendationId: string): Promise<IntelligenceRecommendation | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(recommendationId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as IntelligenceRecommendation;
    return data.businessId === businessId ? data : null;
  }

  /** Every `pending` recommendation of a given type against a given target — the dedupe check every generator runs before writing a new one. */
  async findPendingForTarget(
    businessId: string,
    type: RecommendationType,
    targetKind: IntelligenceRecommendation['target']['kind'],
    targetId: string | null,
  ): Promise<{ id: string; data: IntelligenceRecommendation }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('type', '==', type)
      .where('target.kind', '==', targetKind)
      .where('target.id', '==', targetId)
      .where('status', '==', 'pending')
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as IntelligenceRecommendation }));
  }

  async listByBusiness(
    businessId: string,
    options: { type?: RecommendationType; status?: RecommendationStatus; limit?: number } = {},
  ): Promise<{ id: string; data: IntelligenceRecommendation }[]> {
    let query = adminFirestore.collection(COLLECTION).where('businessId', '==', businessId) as FirebaseFirestore.Query;
    if (options.type) {
      query = query.where('type', '==', options.type);
    }
    if (options.status) {
      query = query.where('status', '==', options.status);
    }
    query = query.orderBy('createdAt', 'desc').limit(options.limit ?? 100);
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as IntelligenceRecommendation }));
  }

  async moveStatus(
    businessId: string,
    recommendationId: string,
    to: RecommendationStatus,
    fields: { actionTaken: string; actionedBy: string },
  ): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(recommendationId);
    const snapshot = await ref.get();
    const data = snapshot.data() as IntelligenceRecommendation | undefined;
    if (!data || data.businessId !== businessId) {
      throw new RecommendationNotFoundError(recommendationId);
    }
    const allowed = RECOMMENDATION_STATUS_TRANSITIONS[data.status] ?? [];
    if (!allowed.includes(to)) {
      throw new IllegalRecommendationTransitionError(data.status, to);
    }
    await ref.update({
      status: to,
      actionTaken: fields.actionTaken,
      actionedBy: fields.actionedBy,
      actionedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: fields.actionedBy,
    });
  }

  async recordOutcome(
    businessId: string,
    recommendationId: string,
    outcome: string,
    outcomeMetrics: Record<string, number | string | null>,
    actor: string,
  ): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(recommendationId);
    const snapshot = await ref.get();
    const data = snapshot.data() as IntelligenceRecommendation | undefined;
    if (!data || data.businessId !== businessId) {
      throw new RecommendationNotFoundError(recommendationId);
    }
    if (data.status !== 'approved') {
      throw new RecommendationNotApprovedError(recommendationId, data.status);
    }
    await ref.update({
      outcome,
      outcomeMetrics,
      outcomeRecordedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor,
    });
  }
}

export const intelligenceRecommendationRepository = new IntelligenceRecommendationRepository();
