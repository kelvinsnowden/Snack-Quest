import { Router } from 'express';
import { WalletController } from './walletController';
import { idempotencyMiddleware } from '../../api/utils/idempotency';

export const walletRouter = Router();

walletRouter.get('/', WalletController.getWallet);
walletRouter.post('/credit', idempotencyMiddleware, WalletController.creditWallet);
walletRouter.post('/redeem', idempotencyMiddleware, WalletController.redeemWallet);
