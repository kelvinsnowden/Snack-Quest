import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';

/**
 * ⚠️ TEMPORARY — DELETE WITH `app/api/webhooks/whatchimp/inspect`.
 *
 * WhatChimp publishes its outbound REST API in full but no schema for
 * the payload its "Trigger Webhook for Incoming Message" setting POSTs
 * to us. Rather than guess a second time (the Gateway was already once
 * built on a Meta Cloud API assumption that turned out wrong in every
 * particular), this records exactly one real inbound request so
 * `WhatchimpGateway.parseIncomingMessage` can be written from fact.
 *
 * The type lives here rather than in `types/` deliberately: this whole
 * concept is scaffolding, and keeping it to two files (this and the
 * route) makes the eventual removal a clean delete rather than a hunt.
 */

const COLLECTION = 'webhookInspections';

export interface WebhookInspection {
  provider: string;
  method: string;
  url: string;
  queryParams: Record<string, string>;
  /** Values of credential-bearing headers are replaced with a length summary — see `maskHeaders`. */
  headers: Record<string, string>;
  contentType: string | null;
  /** How `parsedBody` was produced, so a null parse is never mistaken for an empty payload. */
  bodyFormat: 'json' | 'form' | 'unparsed';
  rawBody: string;
  rawBodyTruncated: boolean;
  parsedBody: unknown;
  remoteIp: string | null;
  receivedAt: FirebaseFirestore.FieldValue;
}

export type WebhookInspectionInput = Omit<WebhookInspection, 'receivedAt'>;

class WebhookInspectionRepository {
  async record(input: WebhookInspectionInput): Promise<string> {
    const ref = await adminFirestore.collection(COLLECTION).add({
      ...input,
      receivedAt: FieldValue.serverTimestamp(),
    });
    return ref.id;
  }

  /** Newest first — how the captured payload actually gets read back. */
  async listRecent(limit = 20): Promise<{ id: string; data: WebhookInspection }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .orderBy('receivedAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as WebhookInspection }));
  }
}

export const webhookInspectionRepository = new WebhookInspectionRepository();
