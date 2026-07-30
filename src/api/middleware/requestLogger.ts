import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { logger } from '../utils/logger';

export function requestLogger(req: CustomRequest, res: Response, next: NextFunction) {
  const start = Date.now();
  const requestId = req.requestId || 'unknown';

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const statusCode = res.statusCode;
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    logger[level](`${req.method} ${req.originalUrl || req.url} -> ${statusCode} (${durationMs}ms)`, {
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    }, {
      requestId,
      userId: req.user?.id,
      ip: req.ip || req.socket.remoteAddress,
      route: req.originalUrl || req.url,
      method: req.method,
      statusCode,
      durationMs,
    });
  });

  next();
}
