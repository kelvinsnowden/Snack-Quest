import { Router } from 'express';
import { CreatorController } from './creatorController';
import { idempotencyMiddleware } from '../../api/utils/idempotency';
import { sensitiveRateLimiter } from '../../api/middleware/rateLimiter';

export const creatorRouter = Router();

creatorRouter.get('/dashboard', CreatorController.getDashboard);
creatorRouter.get('/analytics', CreatorController.getDashboard);
creatorRouter.post('/magic-login', CreatorController.requestMagicLogin);
creatorRouter.post('/withdraw', sensitiveRateLimiter, idempotencyMiddleware, CreatorController.requestWithdrawal);
