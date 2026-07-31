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

export interface WhatsAppInboundMessage {
  providerMessageId: string;
  fromPhone: string;
  text: string;
  receivedAt: string;
}

export interface WhatsAppGateway {
  sendMessage(input: {
    phone: string;
    templateCode: string;
    params: Record<string, string>;
  }): Promise<WhatsAppSendResult>;
  parseInboundWebhook(payload: unknown): WhatsAppInboundMessage;
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
