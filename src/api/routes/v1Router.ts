import { Router, Request, Response } from 'express';
import { sendSuccess } from '../utils/response';
import { authRouter } from './authRoutes';
import { paymentRouter } from '../../modules/payments/paymentRoutes';
import { webhooksRouter } from '../webhooks/webhookRoutes';
import { orderRouter } from '../../modules/orders/orderRoutes';
import { customerRouter } from '../../modules/customers/customerRoutes';
import { walletRouter } from '../../modules/wallet/walletRoutes';
import { referralRouter } from '../../modules/referrals/referralRoutes';
import { creatorRouter } from '../../modules/creators/creatorRoutes';
import { notificationRouter } from '../../modules/notifications/notificationRoutes';
import { inventoryRouter } from '../../modules/inventory/inventoryRoutes';
import { analyticsRouter } from '../../modules/analytics/analyticsRoutes';
import { docsRouter } from '../docs/swaggerUi';

export const v1Router = Router();

// Health Check
v1Router.get('/health', (req: Request, res: Response) => {
  return sendSuccess(res, {
    status: 'ok',
    version: '1.0.0',
    gateway: 'api.snackquests.shop',
    uptime_seconds: process.uptime(),
    timestamp: new Date().toISOString(),
  }, 200);
});

// Feature Modules
v1Router.use('/auth', authRouter);
v1Router.use('/payments', paymentRouter);
v1Router.use('/webhooks', webhooksRouter);
v1Router.use('/orders', orderRouter);
v1Router.use('/customers', customerRouter);
v1Router.use('/wallet', walletRouter);
v1Router.use('/referrals', referralRouter);
v1Router.use('/creators', creatorRouter);
v1Router.use('/notifications', notificationRouter);
v1Router.use('/inventory', inventoryRouter);
v1Router.use('/analytics', analyticsRouter);
v1Router.use('/docs', docsRouter);
