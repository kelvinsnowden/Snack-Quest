import { Router, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './openapi';

export const docsRouter = Router();

// Raw JSON specification endpoint
docsRouter.get('/openapi.json', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(openApiSpec);
});

// Swagger UI mount
docsRouter.use('/', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  customSiteTitle: 'Snack Quest API Documentation | api.snackquests.shop',
  customCss: '.swagger-ui .topbar { background-color: #18181B; } .swagger-ui { font-family: sans-serif; }',
}));
