import type { AuditFields } from './common';

/**
 * `faqs/{faqId}` — admin-managed FAQ entries (§ Admin: FAQ), shown on
 * the homepage's FAQ section and the standalone `/faq` page.
 */
export interface Faq extends AuditFields {
  businessId: string;
  question: string;
  answer: string;
  isActive: boolean;
}
