import { Response } from 'express';
import { CustomRequest } from '../../api/types';
import { sendSuccess, sendError } from '../../api/utils/response';
import { OrderService } from './orderService';

export class OrderController {
  static getAllOrders(req: CustomRequest, res: Response) {
    try {
      const { status, customer_id, search } = req.query;
      const orders = OrderService.getAllOrders({
        status: status as string,
        customerId: customer_id as string,
        search: search as string,
      });
      return sendSuccess(res, orders, 200, { total: orders.length });
    } catch (err: any) {
      return sendError(res, 'FETCH_ORDERS_FAILED', err.message, 500);
    }
  }

  static getOrderById(req: CustomRequest, res: Response) {
    try {
      const { id } = req.params;
      const order = OrderService.getOrderById(id);
      if (!order) {
        return sendError(res, 'ORDER_NOT_FOUND', `Order with ID ${id} not found`, 404);
      }
      return sendSuccess(res, order, 200);
    } catch (err: any) {
      return sendError(res, 'FETCH_ORDER_FAILED', err.message, 500);
    }
  }

  static createOrder(req: CustomRequest, res: Response) {
    try {
      const order = OrderService.createOrder(req.body);
      return sendSuccess(res, order, 201);
    } catch (err: any) {
      return sendError(res, 'CREATE_ORDER_FAILED', err.message, 400);
    }
  }

  static updateOrder(req: CustomRequest, res: Response) {
    try {
      const { id } = req.params;
      const { status, note } = req.body;
      if (!status) {
        return sendError(res, 'MISSING_STATUS', 'order_status is required for update', 400);
      }
      const order = OrderService.updateOrderStatus(id, status, note, req.user?.name || 'API User');
      return sendSuccess(res, order, 200);
    } catch (err: any) {
      return sendError(res, 'UPDATE_ORDER_FAILED', err.message, 400);
    }
  }

  static cancelOrder(req: CustomRequest, res: Response) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const order = OrderService.cancelOrder(id, reason);
      return sendSuccess(res, order, 200);
    } catch (err: any) {
      return sendError(res, 'CANCEL_ORDER_FAILED', err.message, 400);
    }
  }
}
