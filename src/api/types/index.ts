import { Request } from 'express';

export interface ApiResponse<T = any> {
  success: true;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    requestId?: string;
    timestamp?: string;
    [key: string]: any;
  };
}

export interface ApiErrorResponse {
  success: false;
  code: string;
  message: string;
  requestId?: string;
  errors?: any;
  timestamp?: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'admin' | 'staff' | 'customer' | 'creator' | 'agent';
  name?: string;
  phone?: string;
}

export interface CustomRequest extends Request {
  requestId?: string;
  user?: AuthenticatedUser;
  rawBody?: Buffer;
}

export type OrderStatusType =
  | 'Pending'
  | 'Awaiting Payment'
  | 'Paid'
  | 'Preparing'
  | 'Shipped'
  | 'Delivered'
  | 'Cancelled'
  | 'Refunded';

export type PaymentMethodType = 'mpesa_stk' | 'mpesa_till' | 'mpesa_paybill' | 'card' | 'wallet_credits';

export interface IdempotencyRecord {
  key: string;
  statusCode: number;
  responseBody: any;
  createdAt: string;
}
