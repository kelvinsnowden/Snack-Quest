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

export interface WhatsAppInboundMessage {
  providerMessageId: string;
  fromPhone: string;
  /** The WhatsApp Cloud API phone_number_id the message was received on — how a business is resolved from a shared webhook endpoint. */
  toPhoneNumberId: string;
  text: string;
  /** Set when the inbound message was a button/list reply rather than free text. */
  selectedId?: string;
  receivedAt: string;
}

/**
 * The full interface every WhatsApp BSP implementation must satisfy —
 * Whatchimp today, anything else later, never touched by a Service
 * directly (PLATFORM_ARCHITECTURE_V2.md §13). `sendMessage` is
 * free-text (only valid inside WhatsApp's 24-hour customer-initiated
 * session window); `sendTemplate` is the pre-approved-template path
 * required to message a customer outside that window — a real
 * WhatsApp Business API distinction, not an implementation detail.
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
  markAsRead(businessId: string, providerMessageId: string): Promise<void>;
  parseIncomingMessage(payload: unknown): WhatsAppInboundMessage;
  /** Handles the BSP's webhook-verification handshake (e.g. a GET challenge echo) — platform-level, not tenant-scoped; see `types/business.ts`. */
  verifyWebhookChallenge(query: {
    mode?: string;
    token?: string;
    challenge?: string;
  }): string | null;
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
