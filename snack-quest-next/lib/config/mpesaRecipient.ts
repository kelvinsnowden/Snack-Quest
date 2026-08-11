/**
 * The name Safaricom shows on the M-Pesa STK push prompt for this
 * business's Daraja shortcode — set by Safaricom's own business
 * registration, not anything this app configures. It doesn't match
 * the storefront brand name, which is exactly the kind of mismatch
 * that makes a customer hesitate mid-payment or abandon the prompt
 * outright. `CheckoutForm.tsx` names it explicitly, right next to the
 * "Pay with M-Pesa" button, so nothing about the prompt is a surprise.
 */
export const MPESA_RECIPIENT_NAME = 'Snowden Collection';
