import type { Metadata } from 'next';
import Link from 'next/link';
import { WhatsAppOrderButton } from '@/components/marketing/WhatsAppOrderButton';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { faqRepository } from '@/repositories/faqRepository';
import { safeJsonLd } from '@/lib/seo/safeJsonLd';

export const metadata: Metadata = buildPageMetadata({
  title: 'Frequently asked questions',
  description:
    'Answers to the most common questions about ordering, paying, delivery, and the Creator Program.',
  path: '/faq',
});

export default async function FaqPage() {
  const businessId = getCurrentBusinessId();
  // Same "never 500 the whole page" resilience as the homepage's FAQ
  // section — a query failure just means the list is empty here too.
  const faqs = await faqRepository.listActive(businessId).catch(() => []);

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(({ data }) => ({
      '@type': 'Question',
      name: data.question,
      acceptedAnswer: { '@type': 'Answer', text: data.answer },
    })),
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }}
      />
      <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-page-title">
        Frequently asked questions
      </h1>
      <p className="mt-2 text-sm text-muted-foreground sm:mt-3 sm:text-subtitle">
        Can&apos;t find what you&apos;re looking for? Just message us.
      </p>

      {faqs.length > 0 ? (
        <div className="divide-border border-border bg-surface mt-6 flex flex-col divide-y rounded-2xl border sm:mt-10">
          {faqs.map(({ id, data }) => (
            <details key={id} className="group px-4 py-4 sm:px-6 sm:py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-foreground marker:content-none sm:text-card-title">
                {data.question}
                <span className="text-muted-foreground shrink-0 text-xl transition-transform group-open:rotate-45 sm:text-2xl">
                  +
                </span>
              </summary>
              <p className="mt-2 text-sm text-muted-foreground sm:mt-3">{data.answer}</p>
            </details>
          ))}
        </div>
      ) : null}

      <div className="mt-8 flex flex-col gap-4 sm:mt-10">
        <WhatsAppOrderButton message="Hi! I have a question.">
          Ask us on WhatsApp
        </WhatsAppOrderButton>
        <p className="text-sm text-muted-foreground">
          Want the longer version?{' '}
          <Link href="/about" className="text-primary hover:underline">
            Read about Snack Quest
          </Link>{' '}
          or{' '}
          <Link href="/blog/what-is-a-mystery-snack-box" className="text-primary hover:underline">
            what&rsquo;s actually in a box
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
