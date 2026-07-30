import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { sendError } from '../utils/response';
import { config } from '../config';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const requestCounts = new Map<string, RateLimitEntry>();

function checkRateLimit(key: string, maxRequests: number, windowMs: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = requestCounts.get(key) || { count: 0, resetTime: now + windowMs };

  if (now > entry.resetTime) {
    entry.count = 1;
    entry.resetTime = now + windowMs;
  } else {
    entry.count += 1;
  }

  requestCounts.set(key, entry);
  const remaining = Math.max(0, maxRequests - entry.count);
  return { allowed: entry.count <= maxRequests, remaining };
}

export function globalRateLimiter(req: CustomRequest, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const { allowed, remaining } = checkRateLimit(
    `global_${ip}`,
    config.rateLimits.globalMaxRequests,
    config.rateLimits.globalWindowMs
  );

  res.setHeader('X-RateLimit-Limit', config.rateLimits.globalMaxRequests);
  res.setHeader('X-RateLimit-Remaining', remaining);

  if (!allowed) {
    return sendError(res, 'RATE_LIMIT_EXCEEDED', 'Global rate limit exceeded. Please retry after 1 minute.', 429);
  }
  next();
}

export function sensitiveRateLimiter(req: CustomRequest, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const key = `sensitive_${ip}_${req.path}`;
  const { allowed, remaining } = checkRateLimit(
    key,
    config.rateLimits.sensitiveMaxRequests,
    config.rateLimits.sensitiveWindowMs
  );

  res.setHeader('X-RateLimit-Sensitive-Remaining', remaining);

  if (!allowed) {
    return sendError(
      res,
      'SENSITIVE_RATE_LIMIT_EXCEEDED',
      'Rate limit enforced for sensitive transaction endpoints. Please wait before retrying.',
      429
    );
  }
  next();
}
