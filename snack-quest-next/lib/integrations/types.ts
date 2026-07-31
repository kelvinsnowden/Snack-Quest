/**
 * Gateway interfaces (PLATFORM_ARCHITECTURE_V2.md §13) — the sibling
 * to the Repository layer for everything that fails because *someone
 * else's* API is down, not because our database is down. Services
 * depend on these interfaces, never on a concrete `*Gateway`
 * implementation or a provider SDK directly, so swapping Daraja for
 * another PSP or Jumia for another courier never touches a Service.
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
  sendMessage(input: { phone: string; text: string }): Promise<WhatsAppSendResult>;
  sendTemplate(input: {
    phone: string;
    templateCode: string;
    params: Record<string, string>;
  }): Promise<WhatsAppSendResult>;
  sendButtons(input: {
    phone: string;
    bodyText: string;
    buttons: WhatsAppButton[];
  }): Promise<WhatsAppSendResult>;
  sendList(input: {
    phone: string;
    bodyText: string;
    buttonLabel: string;
    sections: WhatsAppListSection[];
  }): Promise<WhatsAppSendResult>;
  markAsRead(providerMessageId: string): Promise<void>;
  parseIncomingMessage(payload: unknown): WhatsAppInboundMessage;
  /** Handles the BSP's webhook-verification handshake (e.g. a GET challenge echo). Returns the challenge to echo back, or null if verification fails. */
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
    orderId: string;
    recipientName: string;
    recipientPhone: string;
    deliverTo: Record<string, unknown>;
  }): Promise<ShipmentResult>;
  getTrackingStatus(shipmentRef: string): Promise<TrackingStatus>;
  parseTrackingWebhook(payload: unknown): TrackingStatus;
}

export interface ConversionGateway {
  sendEvent(input: {
    eventName: string;
    params: Record<string, unknown>;
    advancedMatching?: Record<string, string>;
  }): Promise<void>;
}

export interface EmailGateway {
  send(input: {
    to: string;
    templateCode: string;
    params: Record<string, string>;
  }): Promise<void>;
}

export interface SmsGateway {
  send(input: { phone: string; message: string }): Promise<void>;
}

export interface PushGateway {
  send(input: { deviceToken: string; payload: Record<string, unknown> }): Promise<void>;
}
