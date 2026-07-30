import { Response } from 'express';
import { CustomRequest } from '../../api/types';
import { sendSuccess, sendError } from '../../api/utils/response';
import { WalletService } from './walletService';

export class WalletController {
  static getWallet(req: CustomRequest, res: Response) {
    try {
      const customerId = (req.query.customer_id as string) || req.user?.id || 'cust-1';
      const wallet = WalletService.getWallet(customerId);
      return sendSuccess(res, wallet, 200);
    } catch (err: any) {
      return sendError(res, 'FETCH_WALLET_FAILED', err.message, 500);
    }
  }

  static creditWallet(req: CustomRequest, res: Response) {
    try {
      const { customer_id, points, reason } = req.body;
      const targetId = customer_id || req.user?.id || 'cust-1';
      if (!points || Number(points) <= 0) {
        return sendError(res, 'INVALID_POINTS', 'points must be greater than 0', 400);
      }
      const wallet = WalletService.creditWallet(targetId, Number(points), reason);
      return sendSuccess(res, wallet, 200);
    } catch (err: any) {
      return sendError(res, 'CREDIT_WALLET_FAILED', err.message, 400);
    }
  }

  static redeemWallet(req: CustomRequest, res: Response) {
    try {
      const { customer_id, points, redemption_type } = req.body;
      const targetId = customer_id || req.user?.id || 'cust-1';
      if (!points || Number(points) <= 0) {
        return sendError(res, 'INVALID_POINTS', 'points must be greater than 0', 400);
      }
      const result = WalletService.redeemWallet(targetId, Number(points), redemption_type);
      return sendSuccess(res, result, 200);
    } catch (err: any) {
      return sendError(res, 'REDEEM_WALLET_FAILED', err.message, 400);
    }
  }
}
