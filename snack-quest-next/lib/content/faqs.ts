/**
 * Single source of truth for the FAQ copy — shared by the standalone
 * `/faq` page and the homepage's FAQ section so the two never drift
 * out of sync with each other.
 */
export interface Faq {
  question: string;
  answer: string;
}

export const FAQS: Faq[] = [
  {
    question: 'Do I need to download an app?',
    answer:
      'No. Every order happens over WhatsApp: no app, no account, nothing to install.',
  },
  {
    question: 'How do I pay?',
    answer:
      'Once you confirm your box and delivery details, reply PAY and we send an M-Pesa STK push to your phone. Nothing is charged until you approve that prompt.',
  },
  {
    question: 'Where do you deliver?',
    answer:
      "We offer door delivery in Nairobi. Outside Nairobi, you can choose a pickup station from our courier network, we'll show you options and fees for your area during checkout.",
  },
  {
    question: 'How long does delivery take?',
    answer:
      "It depends on your delivery method and location. We'll give you an estimate on WhatsApp before you pay, and you can always ask for an update on your order afterward.",
  },
  {
    question: 'Can I change or cancel my order?',
    answer:
      "Message us on WhatsApp as soon as possible. If your order hasn't been packed yet, we can usually adjust or cancel it.",
  },
  {
    question: 'What if something arrives damaged or wrong?',
    answer:
      'Message us with a photo and your order details. We handle refunds and replacements directly, no ticket system, just a reply on the same thread.',
  },
  {
    question: 'How does the Creator Program work?',
    answer:
      'Sign up, get your own referral link, and share it. When someone orders through your link, you earn commission credited to your creator balance, which you can withdraw to M-Pesa.',
  },
];
