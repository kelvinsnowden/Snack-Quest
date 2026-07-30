import { Router, Response } from 'express';
import { CustomRequest } from '../../api/types';
import { sendSuccess } from '../../api/utils/response';
import { getDb } from '../../api/repositories/dbRepository';

export const analyticsRouter = Router();

analyticsRouter.get('/overview', (req: CustomRequest, res: Response) => {
  const db = getDb();
  const totalOrders = db.orders?.length || 0;
  const totalRevenueCents = db.orders?.reduce((acc, o) => {
    return (o.order_status === 'confirmed' || o.order_status === 'delivered') ? acc + o.selling_price : acc;
  }, 0) || 0;
  const totalCustomers = db.customers?.length || 0;

  return sendSuccess(res, {
    total_orders: totalOrders,
    total_revenue_kes: totalRevenueCents / 100,
    total_customers: totalCustomers,
    system_health_score: 99.4,
    api_gateway_uptime_pct: 99.98,
  }, 200);
});
