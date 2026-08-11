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

/**
 * The M-Pesa Express Query ("STK Push Query") response — a status
 * check for a `CheckoutRequestID` whose callback never arrived (§
 * Daraja Production Integration Verification Audit §2.4/§7). Unlike
 * `PaymentCallbackResult`, Safaricom's real query response (confirmed
 * against the primary docs) carries no `CallbackMetadata` — no amount,
 * no M-Pesa receipt number — even on success. `responseCode` is the
 * *query request's own* submission status (e.g. "not yet processed,
 * try again shortly" reads as a non-'0' responseCode here); `resultCode`
 * is the underlying payment's actual result, only meaningful once
 * `responseCode === '0'`.
 */
export interface StkQueryResult {
  merchantRequestId: string;
  checkoutRequestId: string;
  responseCode: string;
  responseDescription: string;
  resultCode: number;
  resultDesc: string;
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
  queryStkStatus(input: { businessId: string; checkoutRequestId: string }): Promise<StkQueryResult>;
}

/** The synchronous ack Safaricom returns the instant a B2C request is accepted for processing — not proof the money moved, just that the request was queued. */
export interface B2CPaymentResult {
  originatorConversationId: string;
  conversationId: string;
  responseCode: string;
  responseDescription: string;
}

/** The async outcome delivered later to the B2C ResultURL — this is the actual proof of success or failure. */
export interface B2CResultCallback {
  originatorConversationId: string;
  conversationId: string;
  resultCode: number;
  resultDesc: string;
  succeeded: boolean;
  /** Present only when `succeeded` — Safaricom's own transaction id for this payout. */
  transactionId?: string;
  amountKes?: number;
  transactionCompletedAt?: string;
}

/**
 * Business-to-customer payouts (§ Admin: Withdrawals — Daraja B2C) —
 * deliberately its own interface, not folded into `PaymentGateway`:
 * a C2B collection and a B2C disbursement are different Safaricom
 * products with different credentials, different request/response
 * shapes, and different risk profiles (this one moves money out).
 */
export interface PayoutGateway {
  initiateB2CPayment(input: {
    businessId: string;
    phone: string;
    amountKes: number;
    remarks: string;
    occasion?: string;
  }): Promise<B2CPaymentResult>;
  verifyB2CResult(payload: unknown): B2CResultCallback;
}

/** The synchronous ack Safaricom returns the instant a reversal request is accepted for processing — not proof the money moved back, just that the request was queued. */
export interface ReversalResult {
  originatorConversationId: string;
  conversationId: string;
  responseCode: string;
  responseDescription: string;
}

/** The async outcome delivered later to the reversal's ResultURL — this is the actual proof of success or failure. */
export interface ReversalResultCallback {
  originatorConversationId: string;
  conversationId: string;
  resultCode: number;
  resultDesc: string;
  succeeded: boolean;
  /** Present only when `succeeded` — Safaricom's own transaction id for the reversal itself. */
  transactionId?: string;
  amountKes?: number;
  transactionCompletedAt?: string;
}

/**
 * Real M-Pesa transaction reversals (§ RefundService + Daraja reversal
 * support) — deliberately its own interface, not folded into
 * `PayoutGateway`: a reversal undoes a specific prior C2B transaction
 * (`TransactionID` in, not a phone number + amount like B2C), a
 * different Safaricom product with its own request/response shape,
 * even though it reuses the same operator credentials as B2C
 * (`InitiatorName`/`SecurityCredential`).
 */
export interface RefundGateway {
  initiateReversal(input: {
    businessId: string;
    transactionId: string;
    amountKes: number;
    remarks: string;
    occasion?: string;
  }): Promise<ReversalResult>;
  verifyReversalResult(payload: unknown): ReversalResultCallback;
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
    /**
     * Where the conversion actually happened — Meta's `action_source`
     * (`'website' | 'chat' | ...`). Determines whether the platform
     * tries to correlate this server event with a browser Pixel
     * session; a purchase that started on the website and is reported
     * as `'chat'` (or vice versa) breaks that correlation even though
     * the event itself still arrives. Gateways that have no such
     * concept (none yet) ignore it.
     */
    actionSource?: string;
    /** The page the conversion is attributed to, e.g. the checkout page's URL — required by some platforms (TikTok) for web events, optional context for others. */
    eventSourceUrl?: string;
    /** A platform's own ad-click id (TikTok's `ttclid`, Meta's `fbclid`-derived `fbc`) — unhashed, passed as-is, distinct from the hashed PII in `advancedMatching`. Absent when the order didn't originate from a tracked ad click. */
    clickId?: string;
  }): Promise<void>;
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
 * catalog sync). `retailerId` is deliberately the *same* identifier as
 * the product's Snack Quest OS id — one identifier, never two catalogs
 * to reconcile.
 *
 * No implementation satisfies this today: WhatChimp's real catalog API
 * only lists catalogs, triggers a whole-catalog pull from Meta Commerce
 * Manager, and manages catalog *orders* — there is no per-item push, so
 * `WhatchimpGateway` throws `WhatchimpCapabilityNotSupportedError` for
 * both methods. The interface stays because the capability is real and
 * a future BSP (or Meta's Catalog Batch API used directly) can provide
 * it; it just cannot be reached through WhatChimp.
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
/**
 * What Vercel Blob's `list()` actually returns per object — deliberately
 * NOT `StorageObjectMetadata`: `list()` never reports a content type (only
 * `head()`/`put()` do), so claiming one here would be fabricated, not
 * read from the provider. `uploadedAt` is real, `list()`-reported data
 * `head()`/`uploadFile()` don't return.
 */
export interface StorageListObject {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: string;
}

export interface StorageListPage {
  objects: StorageListObject[];
  cursor: string | null;
}

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
  /** Lists objects under a pathname prefix (§ Admin: Storage browser) — the pathname convention `services/storageService.ts` builds (`{directory}/{businessId}/...`) is what makes a prefix listing tenant- and directory-scoped. */
  listFiles(input: { prefix: string; cursor?: string; limit?: number }): Promise<StorageListPage>;
}

/**
 * Email and SMS (§ Notification breadth, PLATFORM_ARCHITECTURE_V2.md
 * §10/§13) — like `StorageGateway` above, deliberately no `businessId`
 * parameter: a SendGrid/Africa's Talking account is platform
 * infrastructure with one credential per deployment, not a per-tenant
 * one a business owner configures themselves (unlike Daraja/Whatchimp,
 * which are literally that business's own paybill/WhatsApp number).
 * `NotificationService` is still the only caller — these interfaces
 * exist so the concrete provider (`SendGridGateway`,
 * `AfricasTalkingGateway`) stays swappable without touching it.
 */
export interface EmailSendResult {
  providerMessageId: string;
}

export interface EmailGateway {
  /**
   * `businessId` because email is per-tenant now (§ one email provider
   * for everything): a business that has connected its own SMTP in
   * Admin sends from its own domain, and only one that hasn't falls
   * back to the platform-wide SendGrid account.
   */
  send(input: { businessId: string; to: string; subject: string; body: string }): Promise<EmailSendResult>;
}

export interface SmsSendResult {
  providerMessageId: string;
}

export interface SmsGateway {
  send(input: { to: string; body: string }): Promise<SmsSendResult>;
}
