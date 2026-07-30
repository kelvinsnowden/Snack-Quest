import { Router, Response } from 'express';
import { CustomRequest } from '../../api/types';
import { sendSuccess, sendError } from '../../api/utils/response';
import { getDb } from '../../api/repositories/dbRepository';

export const inventoryRouter = Router();

inventoryRouter.get('/snacks', (req: CustomRequest, res: Response) => {
  const db = getDb();
  return sendSuccess(res, db.snacks || [], 200);
});

inventoryRouter.get('/batches', (req: CustomRequest, res: Response) => {
  const db = getDb();
  return sendSuccess(res, db.snack_batches || [], 200);
});

inventoryRouter.get('/reservations', (req: CustomRequest, res: Response) => {
  const db = getDb();
  return sendSuccess(res, db.inventory_reservations || [], 200);
});

inventoryRouter.get('/warehouses', (req: CustomRequest, res: Response) => {
  const db = getDb();
  return sendSuccess(res, db.warehouses || [], 200);
});
