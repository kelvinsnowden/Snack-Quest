import { Response } from 'express';
import { CustomRequest } from '../../api/types';
import { sendSuccess, sendError } from '../../api/utils/response';
import { PaymentService } from './paymentService';

export class PaymentController {
  static async getOAuthToken(req: CustomRequest, res: Response) {
    try {
      const token = await PaymentService.getDarajaOAuthToken();
      return sendSuccess(res, token);
    } catch (err: any) {
      return sendError(res, 'OAUTH_ERROR', err.message || 'Failed to generate OAuth token', 500);
    }
  }

  static async initiateStkPush(req: CustomRequest, res: Response) {
    try {
      const { phone, amount, order_id, account_reference } = req.body;
      if (!phone || !amount) {
        return sendError(res, 'INVALID_PAYLOAD', 'phone and amount are required.', 400);
      }
      const result = await PaymentService.initiateStkPush({
        phone,
        amount: Number(amount),
        orderId: order_id,
        accountReference: account_reference,
      });
      return sendSuccess(res, result, 200);
    } catch (err: any) {
      return sendError(res, 'STK_PUSH_FAILED', err.message || 'STK Push failed to initiate', 500);
    }
  }

  static async handleStkCallback(req: CustomRequest, res: Response) {
    try {
      const result = await PaymentService.handleStkCallback(req.body);
      return sendSuccess(res, result, 200);
    } catch (err: any) {
      return sendError(res, 'CALLBACK_PROCESSING_FAILED', err.message, 500);
    }
  }

  static async processB2CPayout(req: CustomRequest, res: Response) {
    try {
      const { phone, amount, remark } = req.body;
      if (!phone || !amount) {
        return sendError(res, 'INVALID_PAYLOAD', 'phone and amount are required', 400);
      }
      const result = await PaymentService.processB2CPayout(phone, Number(amount), remark);
      return sendSuccess(res, result, 200);
    } catch (err: any) {
      return sendError(res, 'B2C_PAYOUT_FAILED', err.message, 500);
    }
  }

  static async verifyPayment(req: CustomRequest, res: Response) {
    try {
      const { receipt } = req.params;
      const verification = await PaymentService.verifyPaymentByReceipt(receipt);
      if (!verification) {
        return sendError(res, 'RECEIPT_NOT_FOUND', `Receipt ${receipt} not found`, 404);
      }
      return sendSuccess(res, verification, 200);
    } catch (err: any) {
      return sendError(res, 'VERIFICATION_FAILED', err.message, 500);
    }
  }
}
