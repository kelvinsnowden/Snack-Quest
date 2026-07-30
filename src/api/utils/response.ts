import { Response } from 'express';
import { ApiResponse, ApiErrorResponse, CustomRequest } from '../types';

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: Record<string, any>
): Response {
  const req = res.req as CustomRequest;
  const responsePayload: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      requestId: req?.requestId,
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
  return res.status(statusCode).json(responsePayload);
}

export function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode = 400,
  errors?: any
): Response {
  const req = res.req as CustomRequest;
  const errorPayload: ApiErrorResponse = {
    success: false,
    code,
    message,
    requestId: req?.requestId,
    timestamp: new Date().toISOString(),
    ...(errors ? { errors } : {}),
  };
  return res.status(statusCode).json(errorPayload);
}
