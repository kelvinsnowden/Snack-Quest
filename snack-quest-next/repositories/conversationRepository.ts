import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { Conversation, ConversationMessage, ConversationStateBlob, ConversationStep } from '@/types';

/**
 * `conversations` + `messages` subcollection reads/writes
 * (PLATFORM_ARCHITECTURE_V2.md §6). Persistence only — the state
 * machine and business rules live in `lib/conversation/stateMachine.ts`
 * and `services/conversationService.ts`.
 *
 * Every read that could span tenants (i.e. every query, as opposed to
 * a single doc-by-id lookup) is scoped by `businessId` — phone numbers
 * are not globally unique to one business, and never will be.
 */

const COLLECTION = 'conversations';

// A conversation is "in progress" (should be resumed rather than
// restarted) in any of these statuses.
const ACTIVE_STATUSES = ['active', 'awaiting_payment', 'agent_assigned'];

export interface CreateConversationInput {
  businessId: string;
  phoneNumber: string;
  attributionSnapshot?: Record<string, unknown> | null;
  referralLinkId?: string | null;
}

export interface AppendMessageInput {
  direction: ConversationMessage['direction'];
  body: string;
  templateCode?: string | null;
  providerMessageId?: string | null;
}

class ConversationRepository {
  async create(input: CreateConversationInput): Promise<string> {
    const now = FieldValue.serverTimestamp();
    const ref = await adminFirestore.collection(COLLECTION).add({
      businessId: input.businessId,
      phoneNumber: input.phoneNumber,
      customerId: null,
      status: 'active',
      currentStep: 'started',
      stateBlob: {},
      referralLinkId: input.referralLinkId ?? null,
      attributionSnapshot: input.attributionSnapshot ?? null,
      assignedAgentId: null,
      escalationReason: null,
      conversationCheckoutSnapshotId: null,
      startedAt: now,
      lastMessageAt: now,
    });
    return ref.id;
  }

  async findById(conversationId: string): Promise<Conversation | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .doc(conversationId)
      .get();
    if (!snapshot.exists) {
      return null;
    }
    return snapshot.data() as Conversation;
  }

  /**
   * The natural resumption lookup: "does this phone number already
   * have an in-progress conversation with this business?" Ordered by
   * most recent so a customer who somehow has more than one active
   * thread resumes the newest, never an arbitrary one.
   */
  async findActiveByPhoneNumber(
    businessId: string,
    phoneNumber: string,
  ): Promise<{ id: string; conversation: Conversation } | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('phoneNumber', '==', phoneNumber)
      .where('status', 'in', ACTIVE_STATUSES)
      .orderBy('startedAt', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }
    const doc = snapshot.docs[0];
    return { id: doc.id, conversation: doc.data() as Conversation };
  }

  /** A real, cheap count for the Admin dashboard (§ Admin auth foundation) — uses Firestore's aggregation `count()` so it never pulls full documents just to size a stat card. */
  async countByStatus(businessId: string, status: Conversation['status']): Promise<number> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('status', '==', status)
      .count()
      .get();
    return snapshot.data().count;
  }

  async updateStep(
    conversationId: string,
    step: ConversationStep,
    stateBlobPatch: Partial<ConversationStateBlob> = {},
  ): Promise<void> {
    const updates: Record<string, unknown> = { currentStep: step };
    for (const [key, value] of Object.entries(stateBlobPatch)) {
      updates[`stateBlob.${key}`] = value;
    }
    await adminFirestore.collection(COLLECTION).doc(conversationId).update(updates);
  }

  async update(
    conversationId: string,
    partial: Partial<Conversation>,
  ): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(conversationId)
      .update({ ...partial });
  }

  async appendMessage(
    conversationId: string,
    message: AppendMessageInput,
  ): Promise<void> {
    const now = FieldValue.serverTimestamp();
    const conversationRef = adminFirestore.collection(COLLECTION).doc(conversationId);
    await adminFirestore.runTransaction(async (tx) => {
      const messageRef = conversationRef.collection('messages').doc();
      tx.set(messageRef, {
        direction: message.direction,
        body: message.body,
        templateCode: message.templateCode ?? null,
        providerMessageId: message.providerMessageId ?? null,
        sentAt: now,
      });
      tx.update(conversationRef, { lastMessageAt: now });
    });
  }

  async listMessages(conversationId: string): Promise<ConversationMessage[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .doc(conversationId)
      .collection('messages')
      .orderBy('sentAt', 'asc')
      .get();
    return snapshot.docs.map((doc) => doc.data() as ConversationMessage);
  }
}

export const conversationRepository = new ConversationRepository();
