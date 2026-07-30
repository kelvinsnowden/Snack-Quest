import { Router } from 'express';
import { ReferralController } from './referralController';

export const referralRouter = Router();

referralRouter.get('/', ReferralController.getReferrals);
referralRouter.post('/invite', ReferralController.inviteFriend);
