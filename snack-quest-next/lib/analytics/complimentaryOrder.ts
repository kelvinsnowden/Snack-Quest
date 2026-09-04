import type { Order } from '@/types';

/**
 * A box that was given away rather than sold
 * (§ separate PR boxes from revenue and averages).
 *
 * Every PR box so far is a 100% discount code cut for one influencer,
 * so what they have in common in the data is a total of zero — the
 * same test `isFullyDiscounted` applies at checkout to decide there is
 * no M-Pesa prompt to send, because Daraja will not collect nothing.
 *
 * A total of zero is the only durable evidence there is. `complimentary`
 * is an argument to `ConversationService.completeOrder`, not a field on
 * the order, so nothing else survives to be read here. It is also the
 * true test: an order that collected nothing is a giveaway whatever
 * made it free, and one funded entirely from wallet credit belongs on
 * this side of the line for the same reason — no money arrived on it
 * either.
 *
 * Lives here rather than in one of the two services that need it,
 * because `BusinessAnalyticsService` and `FulfillmentAccountingService`
 * both report on the same orders on adjacent screens. Two copies of
 * this rule would eventually disagree about which boxes were sold, and
 * a margin that disagreed with the revenue card beside it is worse than
 * either number alone.
 */
export function isComplimentaryBox(order: Pick<Order, 'pricing'>): boolean {
  return order.pricing.totalKes === 0;
}
