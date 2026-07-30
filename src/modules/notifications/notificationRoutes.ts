import { Router, Response } from 'express';
import { CustomRequest } from '../../api/types';
import { sendSuccess, sendError } from '../../api/utils/response';
import { getDb, saveDb, addNotificationLog } from '../../api/repositories/dbRepository';

export const notificationRouter = Router();

notificationRouter.get('/', (req: CustomRequest, res: Response) => {
  const db = getDb();
  return sendSuccess(res, db.notifications_log || [], 200);
});

notificationRouter.post('/send', (req: CustomRequest, res: Response) => {
  try {
    const { recipient_type, recipient_id, channel, template_code, payload, related_order_id } = req.body;
    if (!recipient_id || !channel) {
      return sendError(res, 'INVALID_PAYLOAD', 'recipient_id and channel are required', 400);
    }
    const log = addNotificationLog(
      recipient_type || 'customer',
      recipient_id,
      channel,
      template_code || 'GENERIC_ALERT',
      payload || {},
      related_order_id || null
    );
    return sendSuccess(res, log, 201);
  } catch (err: any) {
    return sendError(res, 'SEND_NOTIFICATION_FAILED', err.message, 400);
  }
});
