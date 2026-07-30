export interface StkPushRequest {
  phone: string;
  amount: number;
  order_id?: string;
  account_reference?: string;
  transaction_desc?: string;
  idempotency_key?: string;
}

export interface StkCallbackPayload {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: Array<{
          Name: string;
          Value?: string | number;
        }>;
      };
    };
  };
}

export interface B2CPayoutRequest {
  phone: string;
  amount: number;
  creator_id?: string;
  remarks?: string;
  idempotency_key?: string;
}

export interface ReversalRequest {
  transaction_id: string;
  amount: number;
  reason: string;
}
