export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  host: '0.0.0.0',
  domains: {
    primary: 'snackquests.shop',
    api: 'api.snackquests.shop',
    quest: 'quest.snackquests.shop',
    creators: 'creators.snackquests.shop',
    admin: 'admin.snackquests.shop',
    cdn: 'cdn.snackquests.shop',
  },
  baseUrls: {
    public: 'https://snackquests.shop',
    api: 'https://api.snackquests.shop',
    quest: 'https://quest.snackquests.shop',
    creators: 'https://creators.snackquests.shop',
    admin: 'https://admin.snackquests.shop',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'snackquest_jwt_secret_production_2026_key_99x',
    expiresIn: '7d',
  },
  cors: {
    allowedOrigins: [
      'https://snackquests.shop',
      'https://quest.snackquests.shop',
      'https://creators.snackquests.shop',
      'https://admin.snackquests.shop',
      'https://api.snackquests.shop',
    ],
  },
  daraja: {
    consumerKey: process.env.DARAJA_CONSUMER_KEY || 'Safaricom_Daraja_ConsumerKey_2026',
    consumerSecret: process.env.DARAJA_CONSUMER_SECRET || 'Safaricom_Daraja_ConsumerSecret_2026',
    passkey: process.env.DARAJA_PASSKEY || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919',
    shortcode: process.env.DARAJA_SHORTCODE || '174379',
    paybill: process.env.DARAJA_PAYBILL || '4088200',
    stkCallbackUrl: 'https://api.snackquests.shop/v1/webhooks/daraja/stk-callback',
    b2cResultUrl: 'https://api.snackquests.shop/v1/payments/b2c/callback',
    b2cTimeoutUrl: 'https://api.snackquests.shop/v1/payments/b2c/timeout',
  },
  rateLimits: {
    globalWindowMs: 60 * 1000,
    globalMaxRequests: 250,
    sensitiveWindowMs: 60 * 1000,
    sensitiveMaxRequests: 10,
  },
};
