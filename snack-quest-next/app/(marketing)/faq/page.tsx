import type { Metadata } from 'next';
import { WhatsAppOrderButton } from '@/components/marketing/WhatsAppOrderButton';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Frequently asked questions',
  description:
    'Answers to the most common questions about ordering, paying, delivery, and the Creator Program.',
  path: '/faq',
});

const FAQS = [
  {
    question: 'Do I need to download an app?',
    answer:
      'No. Every order happens over WhatsApp — no app, no account, nothing to install.',
  },
  {
    question: 'How do I pay?',
    answer:
      'Once you confirm your box and delivery details, reply PAY and we send a real M-Pesa STK push to your phone. Nothing is charged until you approve that prompt.',
  },
  {
    question: 'Where do you deliver?',
    answer:
      "We offer door delivery in Nairobi. Outside Nairobi, you can choose a pickup station from our courier network — we'll show you real options and fees for your area during checkout.",
  },
  {
    question: 'How long does delivery take?',
    answer:
      "It depends on your delivery method and location — we'll give you a real estimate on WhatsApp before you pay, and you can always ask for an update on your order afterward.",
  },
  {
    question: 'Can I change or cancel my order?',
    answer:
      "Message us on WhatsApp as soon as possible. If your order hasn't been packed yet, we can usually adjust or cancel it.",
  },
  {
    question: 'What if something arrives damaged or wrong?',
    answer:
      'Message us with a photo and your order details. We handle refunds and replacements directly — no ticket system, just a reply on the same thread.',
  },
  {
    question: 'How does the Creator Program work?',
    answer:
      'Sign up, get your own referral link, and share it. When someone orders through your link, you earn a real commission credited to your creator balance, which you can withdraw to M-Pesa.',
  },
];

export default async function FaqPage() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <h1 className="text-page-title text-foreground font-bold tracking-tight">
        Frequently asked questions
      </h1>
      <p className="text-subtitle text-muted-foreground mt-3">
        Can&apos;t find what you&apos;re looking for? Just message us.
      </p>

      <div className="divide-border border-border bg-surface mt-10 flex flex-col divide-y rounded-2xl border">
        {FAQS.map((faq) => (
          <details key={faq.question} className="group px-6 py-5">
            <summary className="text-card-title text-foreground flex cursor-pointer list-none items-center justify-between gap-4 font-semibold marker:content-none">
              {faq.question}
              <span className="text-muted-foreground shrink-0 text-2xl transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="text-muted-foreground mt-3 text-sm">{faq.answer}</p>
          </details>
        ))}
      </div>

      <div className="mt-10">
        <WhatsAppOrderButton message="Hi! I have a question." variant="outline">
          Ask us on WhatsApp
        </WhatsAppOrderButton>
      </div>
    </div>
  );
}
