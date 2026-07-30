import { Response } from 'express';
import { CustomRequest } from '../../api/types';
import { sendSuccess, sendError } from '../../api/utils/response';
import { CustomerService } from './customerService';

export class CustomerController {
  static getProfile(req: CustomRequest, res: Response) {
    try {
      const customerId = req.params.id || req.user?.id || 'cust-1';
      const data = CustomerService.getCustomerProfile(customerId);
      if (!data) {
        return sendError(res, 'CUSTOMER_NOT_FOUND', `Customer ${customerId} not found`, 404);
      }
      return sendSuccess(res, data, 200);
    } catch (err: any) {
      return sendError(res, 'FETCH_CUSTOMER_FAILED', err.message, 500);
    }
  }

  static updateProfile(req: CustomRequest, res: Response) {
    try {
      const customerId = req.params.id || req.user?.id || 'cust-1';
      const updated = CustomerService.updateCustomerProfile(customerId, req.body);
      return sendSuccess(res, updated, 200);
    } catch (err: any) {
      return sendError(res, 'UPDATE_CUSTOMER_FAILED', err.message, 400);
    }
  }
}
