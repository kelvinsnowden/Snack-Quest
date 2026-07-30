import { Response } from 'express';
import { CustomRequest } from '../../api/types';
import { sendSuccess, sendError } from '../../api/utils/response';
import { ReferralService } from './referralService';

export class ReferralController {
  static getReferrals(req: CustomRequest, res: Response) {
    try {
      const customerId = (req.query.customer_id as string) || req.user?.id || 'cust-1';
      const data = ReferralService.getReferralsByCustomer(customerId);
      return sendSuccess(res, data, 200);
    } catch (err: any) {
      return sendError(res, 'FETCH_REFERRALS_FAILED', err.message, 500);
    }
  }

  static inviteFriend(req: CustomRequest, res: Response) {
    try {
      const { referee_email, referee_name } = req.body;
      const referrerId = req.user?.id || 'cust-1';
      if (!referee_email) {
        return sendError(res, 'MISSING_EMAIL', 'referee_email is required', 400);
      }
      const invite = ReferralService.createReferralInvite(referrerId, referee_email, referee_name);
      return sendSuccess(res, invite, 201);
    } catch (err: any) {
      return sendError(res, 'INVITE_FAILED', err.message, 400);
    }
  }
}
