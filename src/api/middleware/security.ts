import { Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { CustomRequest } from '../types';
import { config } from '../config';

export function createRequestId(): string {
  return 'req_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

export function requestIdMiddleware(req: CustomRequest, res: Response, next: NextFunction) {
  const incomingId = req.headers['x-request-id'];
  const reqId = typeof incomingId === 'string' ? incomingId : createRequestId();
  req.requestId = reqId;
  res.setHeader('X-Request-ID', reqId);
  next();
}

export const securityHeaders = helmet({
  contentSecurityPolicy: false, // Disabled for Vite preview compatibility
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'sameorigin' },
  hidePoweredBy: true,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
});

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow server-to-server requests without origin header or matching snackquests.shop domains
    if (!origin) return callback(null, true);
    if (
      origin.includes('snackquests.shop') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.includes('run.app')
    ) {
      return callback(null, true);
    }
    callback(null, true); // Fallback to allowed for flexible preview environments
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-API-Key',
    'X-Request-ID',
    'X-Idempotency-Key',
    'X-Webhook-Signature',
  ],
  exposedHeaders: ['X-Request-ID'],
});
