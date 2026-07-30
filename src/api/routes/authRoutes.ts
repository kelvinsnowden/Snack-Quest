import { Router, Response } from 'express';
import { CustomRequest } from '../types';
import { sendSuccess, sendError } from '../utils/response';
import { generateToken } from '../middleware/auth';
import { getDb } from '../repositories/dbRepository';

export const authRouter = Router();

authRouter.post('/login', (req: CustomRequest, res: Response) => {
  const { email } = req.body;
  if (!email) {
    return sendError(res, 'MISSING_EMAIL', 'Email is required', 400);
  }

  const db = getDb();
  const staff = db.staff_users?.find((s) => s.email.toLowerCase() === email.toLowerCase());
  const customer = db.customers?.find((c) => c.email.toLowerCase() === email.toLowerCase());

  if (staff) {
    const userPayload = {
      id: staff.id,
      email: staff.email,
      name: staff.full_name,
      role: 'admin' as const,
    };
    const token = generateToken(userPayload);
    return sendSuccess(res, { token, user: userPayload }, 200);
  }

  if (customer) {
    const userPayload = {
      id: customer.id,
      email: customer.email,
      name: customer.full_name,
      role: 'customer' as const,
    };
    const token = generateToken(userPayload);
    return sendSuccess(res, { token, user: userPayload }, 200);
  }

  const demoUser = {
    id: 'user_demo_001',
    email,
    name: email.split('@')[0],
    role: 'customer' as const,
  };
  const token = generateToken(demoUser);
  return sendSuccess(res, { token, user: demoUser }, 200);
});

authRouter.get('/me', (req: CustomRequest, res: Response) => {
  if (!req.user) {
    return sendError(res, 'UNAUTHORIZED', 'Not authenticated', 401);
  }
  return sendSuccess(res, { user: req.user }, 200);
});
