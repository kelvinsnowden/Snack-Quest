import { Response } from 'express';
import { CustomRequest } from '../../api/types';
import { sendSuccess, sendError } from '../../api/utils/response';
import { CreatorService } from './creatorService';

export class CreatorController {
  static getDashboard(req: CustomRequest, res: Response) {
    try {
      const creatorId = (req.query.creator_id as string) || req.user?.id || 'creator-1';
      const data = CreatorService.getCreatorDashboard(creatorId);
      return sendSuccess(res, data, 200);
    } catch (err: any) {
      return sendError(res, 'FETCH_CREATOR_DASHBOARD_FAILED', err.message, 500);
    }
  }

  static requestMagicLogin(req: CustomRequest, res: Response) {
    try {
      const { email, phone } = req.body;
      const contact = email || phone;
      if (!contact) {
        return sendError(res, 'MISSING_CONTACT', 'email or phone is required', 400);
      }
      const data = CreatorService.requestMagicLogin(contact);
      return sendSuccess(res, data, 200);
    } catch (err: any) {
      return sendError(res, 'MAGIC_LOGIN_FAILED', err.message, 500);
    }
  }

  static requestWithdrawal(req: CustomRequest, res: Response) {
    try {
      const { amount_kes, phone } = req.body;
      const creatorId = req.user?.id || 'creator-1';
      if (!amount_kes || !phone) {
        return sendError(res, 'INVALID_PAYLOAD', 'amount_kes and phone are required', 400);
      }
      const result = CreatorService.requestWithdrawal(creatorId, Number(amount_kes), phone);
      return sendSuccess(res, result, 201);
    } catch (err: any) {
      return sendError(res, 'WITHDRAWAL_FAILED', err.message, 400);
    }
  }
}
