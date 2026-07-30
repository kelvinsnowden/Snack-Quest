export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Snack Quest API Gateway',
    version: '1.0.0',
    description: 'Production API Gateway for Snack Quest platform (`api.snackquests.shop`). Unified REST API for Daraja, Make.com, WhatChimp, SendGrid, Shopify, Courier, Customer Portal, Creator Portal, and Admin OS.',
    contact: {
      name: 'Snack Quest API Team',
      email: 'api@snackquests.shop',
      url: 'https://snackquests.shop',
    },
  },
  servers: [
    {
      url: 'https://api.snackquests.shop/v1',
      description: 'Production API Gateway Server (v1)',
    },
    {
      url: '/api/v1',
      description: 'Relative API Gateway Endpoint',
    },
  ],
  paths: {
    '/health': {
      get: {
        summary: 'API Health Scorecard',
        tags: ['System'],
        responses: {
          '200': {
            description: 'API Gateway operational status',
          },
        },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Authenticate User or Creator & Issue JWT',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', example: 'admin@snackquest.com' },
                  password: { type: 'string', example: 'secret123' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Authentication successful with JWT token' },
        },
      },
    },
    '/payments/stk': {
      post: {
        summary: 'Initiate Safaricom M-Pesa Daraja STK Push',
        tags: ['Payments'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  phone: { type: 'string', example: '254712345678' },
                  amount: { type: 'number', example: 3500 },
                  order_id: { type: 'string', example: 'ord-101' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'STK Push prompt dispatched' },
        },
      },
    },
    '/payments/verify/{receipt}': {
      get: {
        summary: 'Verify M-Pesa Payment Status',
        tags: ['Payments'],
        parameters: [
          {
            name: 'receipt',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: 'RJK9918231',
          },
        ],
        responses: {
          '200': { description: 'Payment verification status' },
        },
      },
    },
    '/webhooks/daraja': {
      post: {
        summary: 'Daraja M-Pesa Callback Receiver',
        tags: ['Webhooks'],
        responses: {
          '200': { description: 'Callback received and processed' },
        },
      },
    },
    '/orders': {
      get: {
        summary: 'List Orders with Filters',
        tags: ['Orders'],
        responses: {
          '200': { description: 'List of orders' },
        },
      },
      post: {
        summary: 'Create New Snack Box Order',
        tags: ['Orders'],
        responses: {
          '201': { description: 'Order created' },
        },
      },
    },
    '/wallet': {
      get: {
        summary: 'Get Wallet Balance and Transaction History',
        tags: ['Wallet'],
        responses: {
          '200': { description: 'Wallet balance' },
        },
      },
    },
    '/wallet/redeem': {
      post: {
        summary: 'Redeem Wallet Credits for Discounts or Cash',
        tags: ['Wallet'],
        responses: {
          '200': { description: 'Credits redeemed' },
        },
      },
    },
    '/creators/dashboard': {
      get: {
        summary: 'Creator & Affiliate Analytics Dashboard',
        tags: ['Creators'],
        responses: {
          '200': { description: 'Creator dashboard metrics' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
      },
    },
  },
};
