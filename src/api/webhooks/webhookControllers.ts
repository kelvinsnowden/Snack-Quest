import { Response } from 'express';
import { CustomRequest } from '../types';
import { sendSuccess, sendError } from '../utils/response';
import { getDb, saveDb, generateUuid, getNowIso } from '../repositories/dbRepository';
import { logger } from '../utils/logger';

export async function handleWhatChimpWebhook(req: CustomRequest, res: Response) {
  try {
    const db = getDb();
    const payload = req.body;
    const eventId = `whe_wc_${generateUuid().substring(0, 8)}`;

    logger.webhook('whatchimp', 'Received WhatChimp Delivery Event', { payload });

    if (!db.webhook_events) db.webhook_events = [];
    db.webhook_events.unshift({
      id: eventId,
      source: 'whatchimp',
      event_type: payload.event || 'message.status_update',
      payload,
      processing_status: 'processed',
      error_message: null,
      idempotency_key: payload.message_id || eventId,
      created_at: getNowIso(),
      updated_at: getNowIso(),
    });

    saveDb();
    return sendSuccess(res, { event_id: eventId, processed: true }, 200);
  } catch (err: any) {
    return sendError(res, 'WEBHOOK_FAILED', err.message, 400);
  }
}

export async function handleMakeWebhook(req: CustomRequest, res: Response) {
  try {
    const db = getDb();
    const payload = req.body;
    const eventId = `whe_make_${generateUuid().substring(0, 8)}`;

    logger.webhook('make', 'Received Make.com Automation Trigger', { payload });

    if (!db.webhook_events) db.webhook_events = [];
    db.webhook_events.unshift({
      id: eventId,
      source: 'make_com',
      event_type: payload.event_type || 'automation.triggered',
      payload,
      processing_status: 'processed',
      error_message: null,
      idempotency_key: payload.idempotency_key || eventId,
      created_at: getNowIso(),
      updated_at: getNowIso(),
    });

    saveDb();
    return sendSuccess(res, { event_id: eventId, processed: true }, 200);
  } catch (err: any) {
    return sendError(res, 'WEBHOOK_FAILED', err.message, 400);
  }
}

export async function handleSendGridWebhook(req: CustomRequest, res: Response) {
  try {
    const db = getDb();
    const payload = req.body;
    const eventId = `whe_sg_${generateUuid().substring(0, 8)}`;

    logger.webhook('sendgrid', 'Received SendGrid Email Event', { eventsCount: Array.isArray(payload) ? payload.length : 1 });

    if (!db.webhook_events) db.webhook_events = [];
    db.webhook_events.unshift({
      id: eventId,
      source: 'sendgrid',
      event_type: 'email.delivery_event',
      payload,
      processing_status: 'processed',
      error_message: null,
      idempotency_key: eventId,
      created_at: getNowIso(),
      updated_at: getNowIso(),
    });

    saveDb();
    return sendSuccess(res, { event_id: eventId, processed: true }, 200);
  } catch (err: any) {
    return sendError(res, 'WEBHOOK_FAILED', err.message, 400);
  }
}

export async function handleCourierWebhook(req: CustomRequest, res: Response) {
  try {
    const db = getDb();
    const payload = req.body;
    const eventId = `whe_courier_${generateUuid().substring(0, 8)}`;

    logger.webhook('courier', 'Received Courier Waybill Update', { payload });

    if (!db.webhook_events) db.webhook_events = [];
    db.webhook_events.unshift({
      id: eventId,
      source: 'courier_integration',
      event_type: payload.event || 'shipment.status_changed',
      payload,
      processing_status: 'processed',
      error_message: null,
      idempotency_key: payload.waybill_number || eventId,
      created_at: getNowIso(),
      updated_at: getNowIso(),
    });

    saveDb();
    return sendSuccess(res, { event_id: eventId, processed: true }, 200);
  } catch (err: any) {
    return sendError(res, 'WEBHOOK_FAILED', err.message, 400);
  }
}

export async function handleShopifyWebhook(req: CustomRequest, res: Response) {
  try {
    const db = getDb();
    const payload = req.body;
    const eventId = `whe_shopify_${generateUuid().substring(0, 8)}`;

    logger.webhook('shopify', 'Received Shopify Order Event', { payload });

    if (!db.webhook_events) db.webhook_events = [];
    db.webhook_events.unshift({
      id: eventId,
      source: 'shopify',
      event_type: payload.topic || 'orders/create',
      payload,
      processing_status: 'processed',
      error_message: null,
      idempotency_key: payload.id || eventId,
      created_at: getNowIso(),
      updated_at: getNowIso(),
    });

    saveDb();
    return sendSuccess(res, { event_id: eventId, processed: true }, 200);
  } catch (err: any) {
    return sendError(res, 'WEBHOOK_FAILED', err.message, 400);
  }
}
