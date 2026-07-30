import { Request, Response, NextFunction } from 'express';
import { IdempotencyRecord, CustomRequest } from '../types';
import { sendError } from './response';

const idempotencyStore = new Map<string, IdempotencyRecord>();

// Cache idempotency records for 24 hours
const CLEANUP_INTERVAL = 60 * 60 * 1000;
setInterval(() => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  for (const [key, record] of idempotencyStore.entries()) {
    if (record.createdAt < cutoff) {
      idempotencyStore.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

export function getIdempotencyKey(req: Request): string | null {
  const headerKey = req.headers['x-idempotency-key'] || req.headers['idempotency-key'];
  if (typeof headerKey === 'string' && headerKey.trim()) {
    return headerKey.trim();
  }
  if (req.body && typeof req.body.idempotency_key === 'string' && req.body.idempotency_key.trim()) {
    return req.body.idempotency_key.trim();
  }
  return null;
}

export function idempotencyMiddleware(req: CustomRequest, res: Response, next: NextFunction) {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
    return next();
  }

  const key = getIdempotencyKey(req);
  if (!key) {
    return next();
  }

  const cached = idempotencyStore.get(key);
  if (cached) {
    return res.status(cached.statusCode).json(cached.responseBody);
  }

  // Intercept res.json to store response
  const originalJson = res.json;
  res.json = function (body: any) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      idempotencyStore.set(key, {
        key,
        statusCode: res.statusCode,
        responseBody: body,
        createdAt: new Date().toISOString(),
      });
    }
    return originalJson.call(this, body);
  };

  next();
}

export function isKeyAlreadyProcessed(key: string): boolean {
  return idempotencyStore.has(key);
}

export function recordIdempotentKey(key: string, statusCode: number, responseBody: any) {
  idempotencyStore.set(key, {
    key,
    statusCode,
    responseBody,
    createdAt: new Date().toISOString(),
  });
}
