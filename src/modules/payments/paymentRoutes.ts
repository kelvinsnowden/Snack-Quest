import { Router } from 'express';
import { PaymentController } from './paymentController';
import { idempotencyMiddleware } from '../../api/utils/idempotency';
import { sensitiveRateLimiter } from '../../api/middleware/rateLimiter';

export const paymentRouter = Router();

paymentRouter.post('/oauth/token', PaymentController.getOAuthToken);
paymentRouter.post('/stk', sensitiveRateLimiter, idempotencyMiddleware, PaymentController.initiateStkPush);
paymentRouter.post('/stk-push', sensitiveRateLimiter, idempotencyMiddleware, PaymentController.initiateStkPush);
paymentRouter.post('/callback', PaymentController.handleStkCallback);
paymentRouter.post('/b2c', sensitiveRateLimiter, idempotencyMiddleware, PaymentController.processB2CPayout);
paymentRouter.get('/verify/:receipt', PaymentController.verifyPayment);
