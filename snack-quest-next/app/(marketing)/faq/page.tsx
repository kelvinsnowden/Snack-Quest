import type { Metadata } from 'next';
import { WhatsAppOrderButton } from '@/components/marketing/WhatsAppOrderButton';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { FAQS } from '@/lib/content/faqs';

export const metadata: Metadata = buildPageMetadata({
  title: 'Frequently asked questions',
  description:
    'Answers to the most common questions about ordering, paying, delivery, and the Creator Program.',
  path: '/faq',
});

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
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-page-title">
        Frequently asked questions
      </h1>
      <p className="mt-2 text-sm text-muted-foreground sm:mt-3 sm:text-subtitle">
        Can&apos;t find what you&apos;re looking for? Just message us.
      </p>

      <div className="divide-border border-border bg-surface mt-6 flex flex-col divide-y rounded-2xl border sm:mt-10">
        {FAQS.map((faq) => (
          <details key={faq.question} className="group px-4 py-4 sm:px-6 sm:py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-foreground marker:content-none sm:text-card-title">
              {faq.question}
              <span className="text-muted-foreground shrink-0 text-xl transition-transform group-open:rotate-45 sm:text-2xl">
                +
              </span>
            </summary>
            <p className="mt-2 text-sm text-muted-foreground sm:mt-3">{faq.answer}</p>
          </details>
        ))}
      </div>

      <div className="mt-8 sm:mt-10">
        <WhatsAppOrderButton message="Hi! I have a question." variant="outline">
          Ask us on WhatsApp
        </WhatsAppOrderButton>
      </div>
    </div>
  );
}
