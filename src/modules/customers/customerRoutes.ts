import { Router } from 'express';
import { CustomerController } from './customerController';

export const customerRouter = Router();

customerRouter.get('/profile', CustomerController.getProfile);
customerRouter.get('/:id', CustomerController.getProfile);
customerRouter.put('/:id', CustomerController.updateProfile);
customerRouter.patch('/:id', CustomerController.updateProfile);
