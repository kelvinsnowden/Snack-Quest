/**
 * Gateway interfaces (PLATFORM_ARCHITECTURE_V2.md §13) — the sibling
 * to the Repository layer for everything that fails because *someone
 * else's* API is down, not because our database is down. Services
 * depend on these interfaces, never on a concrete `*Gateway`
 * implementation or a provider SDK directly, so swapping Daraja for
 * another PSP or Jumia for another courier never touches a Service.
 *
 * Every outbound-call method takes `businessId` — there is no such
 * thing as "the" Daraja credentials or "the" WhatsApp number anymore,
 * only a given business's. Pure-parsing methods (`verifyCallback`,
 * `parseIncomingMessage`, `parseTrackingWebhook`) don't, because they
 * make no outbound call and need no credential — resolving *which*
 * business a parsed payload belongs to is the caller's job (a route
 * or Service), using data the payload itself carries (e.g. Whatchimp's
 * `phone_number_id`), not something a Gateway method infers.
 */

export interface StkPushResult {
  merchantRequestId: string;
  checkoutRequestId: string;
  responseCode: string;
  responseDescription: string;
  customerMessage: string;
}

export interface PaymentCallbackResult {
  checkoutRequestId: string;
  merchantRequestId: string;
  resultCode: number;
  resultDesc: string;
  /** Present only when resultCode indicates success. */
  amountKes?: number;
  mpesaReceiptNumber?: string;
  transactionDate?: string;
  phoneNumber?: string;
}

export interface PaymentGateway {
  initiateStkPush(input: {
    businessId: string;
    phone: string;
    amountKes: number;
    accountReference: string;
    transactionDesc: string;
  }): Promise<StkPushResult>;
  verifyCallback(payload: unknown): PaymentCallbackResult;
}

export interface WhatsAppSendResult {
  providerMessageId: string;
}

export interface WhatsAppButton {
  id: string;
  title: string;
}

export interface WhatsAppListRow {
  id: string;
  title: string;
  description?: string;
}

export interface WhatsAppListSection {
  title: string;
  rows: WhatsAppListRow[];
}

export interface WhatsAppCatalogOrderItem {
  productRetailerId: string;
  quantity: number;
  /** The price the customer's WhatsApp client displayed at selection time — informational only. Snack Quest OS is always the pricing authority; this value is never trusted for charging. */
  itemPriceKes?: number;
}

/** The "Receive Order" capability's payload — a customer's WhatsApp Product Catalog cart, submitted as a structured signal instead of free text. */
export interface WhatsAppCatalogOrder {
  catalogId: string;
  items: WhatsAppCatalogOrderItem[];
  /** Optional free-text note the customer attached to the cart. */
  text?: string;
}

export interface WhatsAppInboundMessage {
  providerMessageId: string;
  fromPhone: string;
  /** The WhatsApp Cloud API phone_number_id the message was received on — how a business is resolved from a shared webhook endpoint. */
  toPhoneNumberId: string;
  text: string;
  /** Set when the inbound message was a button/list reply rather than free text. */
  selectedId?: string;
  /** Set only when the customer submitted a Product Catalog cart — see `WhatsAppCatalogOrder`. */
  catalogOrder?: WhatsAppCatalogOrder;
  receivedAt: string;
}

/**
 * The full interface every WhatsApp BSP implementation must satisfy —
 * Whatchimp today, anything else later, never touched by a Service
 * directly (PLATFORM_ARCHITECTURE_V2.md §13). This is the capability
 * boundary: Snack Quest OS depends on these method signatures only,
 * never on how a given BSP implements them — swapping Whatchimp for
 * 360dialog, Respond.io, or Meta's Cloud API directly means writing a
 * new class that satisfies this interface, not touching the checkout,
 * conversation engine, payment flow, or order processing.
 *
 * `sendMessage` is free-text (only valid inside WhatsApp's 24-hour
 * customer-initiated session window); `sendTemplate` is the
 * pre-approved-template path required to message a customer outside
 * that window — a real WhatsApp Business API distinction, not an
 * implementation detail.
 */
export interface WhatsAppGateway {
  sendMessage(input: {
    businessId: string;
    phone: string;
    text: string;
  }): Promise<WhatsAppSendResult>;
  sendTemplate(input: {
    businessId: string;
    phone: string;
    templateCode: string;
    params: Record<string, string>;
  }): Promise<WhatsAppSendResult>;
  sendButtons(input: {
    businessId: string;
    phone: string;
    bodyText: string;
    buttons: WhatsAppButton[];
  }): Promise<WhatsAppSendResult>;
  sendList(input: {
    businessId: string;
    phone: string;
    bodyText: string;
    buttonLabel: string;
    sections: WhatsAppListSection[];
  }): Promise<WhatsAppSendResult>;
  /**
   * "Send Catalog Messages" — shows the customer one or more specific
   * products from the business's WhatsApp Product Catalog (e.g. a
   * targeted recommendation). Distinct from the customer browsing the
   * catalog natively via their own WhatsApp client, which needs no
   * outbound call from this platform at all — today's real customer
   * journey never calls this, but it's a real capability a future
   * feature (recommendations, cart recovery) can use without a new
   * Gateway method.
   */
  sendCatalogMessage(input: {
    businessId: string;
    phone: string;
    catalogId: string;
    productRetailerIds: string[];
    bodyText?: string;
  }): Promise<WhatsAppSendResult>;
  markAsRead(businessId: string, providerMessageId: string): Promise<void>;
  parseIncomingMessage(payload: unknown): WhatsAppInboundMessage;
  /** Handles the BSP's webhook-verification handshake (e.g. a GET challenge echo) — platform-level, not tenant-scoped; see `types/business.ts`. */
  verifyWebhookChallenge(query: {
    mode?: string;
    token?: string;
    challenge?: string;
  }): string | null;
  /**
   * "Assign Human Agent" — tells the BSP layer a conversation now
   * needs a human, so its own inbox/routing reflects that alongside
   * Snack Quest OS's own Firestore state (`Conversation.status ===
   * 'agent_assigned'`, which remains the actual source of truth
   * regardless of whether this call succeeds). Every caller treats
   * this as best-effort — a BSP outage must never block a handoff
   * that has already happened in Firestore.
   */
  assignHumanAgent(input: { businessId: string; phone: string; reason: string }): Promise<void>;
  /**
   * "Update Conversation" — updates the BSP's own conversation/contact
   * status (e.g. resolved, needs-attention) so its inbox stays
   * consistent with Snack Quest OS's state. Same best-effort discipline
   * as `assignHumanAgent`.
   */
  updateConversationStatus(input: { businessId: string; phone: string; status: string }): Promise<void>;
}

export interface ShipmentResult {
  courierShipmentRef: string;
  trackingUrl: string;
}

export interface TrackingStatus {
  courierShipmentRef: string;
  status: string;
  lastUpdatedAt: string;
}

export interface CourierGateway {
  createShipment(input: {
    businessId: string;
    orderId: string;
    recipientName: string;
    recipientPhone: string;
    deliverTo: Record<string, unknown>;
  }): Promise<ShipmentResult>;
  getTrackingStatus(businessId: string, shipmentRef: string): Promise<TrackingStatus>;
  parseTrackingWebhook(payload: unknown): TrackingStatus;
}

export interface ConversionGateway {
  sendEvent(input: {
    businessId: string;
    eventName: string;
    params: Record<string, unknown>;
    advancedMatching?: Record<string, string>;
  }): Promise<void>;
}

export interface EmailGateway {
  send(input: {
    businessId: string;
    to: string;
    templateCode: string;
    params: Record<string, string>;
  }): Promise<void>;
}

export interface SmsGateway {
  send(input: { businessId: string; phone: string; message: string }): Promise<void>;
}

export interface PushGateway {
  send(input: {
    businessId: string;
    deviceToken: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
}

/**
 * Product catalog sync — Snack Quest OS owns the master catalog;
 * WhatsApp's Product Catalog is a mirror kept in sync (§ product
 * catalog sync). Modeled on Meta's real, public WhatsApp Commerce
 * Catalog Batch API (`POST /{catalog_id}/items_batch`) — the one
 * genuinely documented external contract available here, since
 * Whatchimp itself has no real, independently verifiable API
 * documentation (see `whatchimpGateway.ts`'s own note on this).
 * `retailerId` is deliberately the *same* identifier as the product's
 * Snack Quest OS id — one identifier, never two catalogs to reconcile.
 */
export interface ProductCatalogItem {
  retailerId: string;
  name: string;
  description: string;
  priceKes: number;
  imageUrl: string | null;
  availability: 'in stock' | 'out of stock';
}

export interface ProductCatalogGateway {
  syncItem(businessId: string, item: ProductCatalogItem): Promise<void>;
  removeItem(businessId: string, retailerId: string): Promise<void>;
}

export interface StorageObjectMetadata {
  url: string;
  pathname: string;
  contentType: string;
  size: number;
}

/**
 * File storage — Vercel Blob today (`lib/integrations/vercelBlob/`),
 * anything else later (§ Vercel Blob migration). Unlike every other
 * Gateway above, methods here do NOT take `businessId`: Vercel Blob is
 * platform infrastructure with one store and one token per deployment
 * (like Firestore itself), not a tenant-owned credential resolved per
 * business — `services/storageService.ts` is where `businessId`
 * becomes part of the object's *path* for tenant organization, which
 * is a naming concern, not a credentials one.
 */
export interface StorageGateway {
  uploadFile(input: {
    pathname: string;
    data: Buffer;
    contentType: string;
    /** Overwrite an existing object at this exact pathname — used by replaceFile(), never by a fresh upload. */
    allowOverwrite?: boolean;
  }): Promise<StorageObjectMetadata>;
  deleteFile(url: string): Promise<void>;
  getMetadata(url: string): Promise<StorageObjectMetadata>;
}
