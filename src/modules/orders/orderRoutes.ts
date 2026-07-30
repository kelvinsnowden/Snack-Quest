import { Router } from 'express';
import { OrderController } from './orderController';
import { idempotencyMiddleware } from '../../api/utils/idempotency';

export const orderRouter = Router();

orderRouter.get('/', OrderController.getAllOrders);
orderRouter.get('/:id', OrderController.getOrderById);
orderRouter.post('/', idempotencyMiddleware, OrderController.createOrder);
orderRouter.patch('/:id', OrderController.updateOrder);
orderRouter.put('/:id', OrderController.updateOrder);
orderRouter.delete('/:id', OrderController.cancelOrder);
