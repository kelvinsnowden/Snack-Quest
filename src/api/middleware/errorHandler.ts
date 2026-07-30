import { Request, Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { sendError } from '../utils/response';
import { logger } from '../utils/logger';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  const customReq = req as CustomRequest;
  const statusCode = err.statusCode || err.status || 500;
  const code = err.code || 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'An unexpected internal server error occurred.';

  logger.error(`API Error on ${req.method} ${req.url}: ${message}`, {
    stack: err.stack,
    details: err.details || null,
  }, {
    requestId: customReq.requestId,
    userId: customReq.user?.id,
    route: req.url,
    method: req.method,
    statusCode,
  });

  return sendError(res, code, message, statusCode, err.errors || null);
}
