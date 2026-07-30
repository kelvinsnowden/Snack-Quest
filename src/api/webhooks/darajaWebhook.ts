import { Response } from 'express';
import { CustomRequest } from '../types';
import { sendSuccess, sendError } from '../utils/response';
import { getDb, saveDb, generateUuid, getNowIso } from '../repositories/dbRepository';
import { logger } from '../utils/logger';
import { PaymentService } from '../../modules/payments/paymentService';

export async function handleDarajaWebhook(req: CustomRequest, res: Response) {
  try {
    const db = getDb();
    const payload = req.body;
    const eventId = `whe_daraja_${generateUuid().substring(0, 8)}`;

    logger.webhook('daraja', 'Ingested Daraja Event', { payload });

    // Store in webhook event history
    if (!db.webhook_events) db.webhook_events = [];
    db.webhook_events.unshift({
      id: eventId,
      source: 'daraja',
      event_type: 'payment.callback',
      payload,
      processing_status: 'processed',
      error_message: null,
      idempotency_key: payload?.Body?.stkCallback?.CheckoutRequestID || eventId,
      created_at: getNowIso(),
      updated_at: getNowIso(),
    });

    if (payload?.Body?.stkCallback) {
      await PaymentService.handleStkCallback(payload);
    }

    saveDb();
    return sendSuccess(res, { event_id: eventId, processed: true }, 200);
  } catch (err: any) {
    logger.error(`Daraja webhook error: ${err.message}`);
    return sendError(res, 'WEBHOOK_FAILED', err.message, 400);
  }
}
