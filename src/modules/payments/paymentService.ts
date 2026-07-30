import { getDb, saveDb, generateUuid, getNowIso, addAuditLog, addNotificationLog } from '../../api/repositories/dbRepository';
import { Payment, PaymentTimelineEvent } from '../../types/database';

export interface StkPushParams {
  phone: string;
  amount: number;
  orderId?: string;
  accountReference?: string;
}

export interface DarajaConfig {
  consumerKey: string;
  consumerSecret: string;
  passkey: string;
  shortcode: string;
  callbackUrl: string;
}

export class PaymentService {
  private static config: DarajaConfig = {
    consumerKey: process.env.DARAJA_CONSUMER_KEY || 'demo_consumer_key',
    consumerSecret: process.env.DARAJA_CONSUMER_SECRET || 'demo_consumer_secret',
    passkey: process.env.DARAJA_PASSKEY || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919',
    shortcode: process.env.DARAJA_SHORTCODE || '174379',
    callbackUrl: process.env.DARAJA_CALLBACK_URL || 'https://api.snackquests.shop/v1/webhooks/daraja',
  };

  static async getDarajaOAuthToken() {
    return {
      access_token: `daraja_tok_${generateUuid().substring(0, 16)}`,
      expires_in: 3599,
      token_type: 'Bearer',
    };
  }

  static async initiateStkPush(params: StkPushParams) {
    const db = getDb();
    const formattedPhone = this.formatPhoneNumber(params.phone);
    const checkoutRequestId = `ws_CO_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const merchantRequestId = `MRK_${Date.now()}`;
    const orderId = params.orderId || `ord-${generateUuid().substring(0, 8)}`;
    const now = getNowIso();

    const paymentRecord: Payment = {
      id: `pay-${generateUuid().substring(0, 8)}`,
      order_id: orderId,
      customer_id: 'cust-1',
      amount: Math.round(params.amount * 100),
      method: 'daraja_stk',
      mpesa_receipt_number: null,
      phone_number: formattedPhone,
      checkout_request_id: checkoutRequestId,
      merchant_request_id: merchantRequestId,
      idempotency_key: generateUuid(),
      status: 'pending',
      result_code: null,
      result_desc: null,
      failure_reason: null,
      paid_at: null,
      reconciled: false,
      created_at: now,
      updated_at: now,
    };

    if (!db.payments) db.payments = [];
    db.payments.unshift(paymentRecord);

    const order = db.orders?.find((o) => o.id === orderId);
    if (order) {
      order.order_status = 'pending';
      order.payment_status = 'pending';
    }

    if (!db.payment_timeline_events) db.payment_timeline_events = [];
    const timelineEvent: PaymentTimelineEvent = {
      id: generateUuid(),
      payment_id: paymentRecord.id,
      order_id: orderId,
      event_type: 'stk_initiated',
      source: 'daraja_gateway',
      actor: 'system',
      message: `STK Push initiated to ${formattedPhone} for KES ${params.amount}`,
      metadata: { checkoutRequestId, merchantRequestId },
      created_at: now,
      updated_at: now,
    };
    db.payment_timeline_events.unshift(timelineEvent);

    addAuditLog('system', 'daraja-service', 'Payment Service', 'stk_push_initiate', 'payment', paymentRecord.id, `STK Push dispatched to ${formattedPhone}`);
    saveDb();

    return {
      success: true,
      checkoutRequestId,
      merchantRequestId,
      responseCode: '0',
      responseDescription: 'Success. Request accepted for processing',
      customerMessage: 'Success. Request accepted for processing',
      paymentId: paymentRecord.id,
    };
  }

  static processCallback(callbackData: any) {
    const db = getDb();
    const stkCallback = callbackData?.Body?.stkCallback;
    if (!stkCallback) return { success: false, reason: 'Invalid payload structure' };

    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stkCallback;
    const payment = db.payments?.find((p) => p.checkout_request_id === CheckoutRequestID);

    if (!payment) {
      return { success: false, reason: `Payment not found for CheckoutRequestID: ${CheckoutRequestID}` };
    }

    const now = getNowIso();
    payment.result_code = ResultCode;
    payment.result_desc = ResultDesc;
    payment.updated_at = now;

    if (ResultCode === 0 && CallbackMetadata?.Item) {
      let receipt = '';
      let phone = '';
      let amountCents = 0;

      for (const item of CallbackMetadata.Item) {
        if (item.Name === 'MpesaReceiptNumber') receipt = item.Value;
        if (item.Name === 'PhoneNumber') phone = String(item.Value);
        if (item.Name === 'Amount') amountCents = Math.round(Number(item.Value) * 100);
      }

      payment.status = 'completed';
      payment.mpesa_receipt_number = receipt;
      payment.paid_at = now;

      const order = db.orders?.find((o) => o.id === payment.order_id);
      if (order) {
        order.order_status = 'confirmed';
        order.payment_status = 'completed';
        order.final_amount_paid = amountCents;
      }

      addNotificationLog('customer', payment.customer_id || 'cust-1', 'whatsapp', 'PAYMENT_RECEIPT', {
        receipt,
        amount_kes: amountCents / 100,
        order_id: payment.order_id,
      }, payment.order_id);

    } else {
      payment.status = 'failed';
      payment.failure_reason = ResultDesc || 'STK Push failed or cancelled by user';
    }

    saveDb();
    return { success: true, payment };
  }

  static handleStkCallback(callbackData: any) {
    return this.processCallback(callbackData);
  }

  static processB2CPayout(phone: string, amount: number, remark = 'Affiliate Withdrawal') {
    const formattedPhone = this.formatPhoneNumber(phone);
    const conversationId = `AG_2026_${generateUuid().substring(0, 8)}`;
    return {
      success: true,
      conversation_id: conversationId,
      recipient_phone: formattedPhone,
      amount_kes: amount,
      response_description: 'B2C payout request accepted for processing.',
    };
  }

  static verifyReceipt(receiptNumber: string) {
    const db = getDb();
    const payment = db.payments?.find((p) => p.mpesa_receipt_number === receiptNumber);
    if (!payment) return null;

    return {
      verified: payment.status === 'completed',
      receipt_number: payment.mpesa_receipt_number,
      amount_kes: payment.amount / 100,
      paid_at: payment.paid_at,
      status: payment.status,
      order_id: payment.order_id,
    };
  }

  static verifyPaymentByReceipt(receiptNumber: string) {
    return this.verifyReceipt(receiptNumber);
  }

  private static formatPhoneNumber(phone: string): string {
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('0')) {
      clean = `254${clean.substring(1)}`;
    } else if (clean.startsWith('7') || clean.startsWith('1')) {
      clean = `254${clean}`;
    }
    return clean;
  }
}
