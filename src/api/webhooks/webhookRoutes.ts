import { Router } from 'express';
import { handleDarajaWebhook } from './darajaWebhook';
import {
  handleWhatChimpWebhook,
  handleMakeWebhook,
  handleSendGridWebhook,
  handleCourierWebhook,
  handleShopifyWebhook,
} from './webhookControllers';

export const webhooksRouter = Router();

webhooksRouter.post('/daraja', handleDarajaWebhook);
webhooksRouter.post('/daraja/stk-callback', handleDarajaWebhook);
webhooksRouter.post('/whatchimp', handleWhatChimpWebhook);
webhooksRouter.post('/make', handleMakeWebhook);
webhooksRouter.post('/sendgrid', handleSendGridWebhook);
webhooksRouter.post('/courier', handleCourierWebhook);
webhooksRouter.post('/shopify', handleShopifyWebhook);
