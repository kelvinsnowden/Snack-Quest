import type { Metadata } from 'next';
import { AlertTriangle } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { faqRepository } from '@/repositories/faqRepository';
import { FaqFormDialog } from '@/components/admin/FaqFormDialog';
import { FaqTable } from '@/components/admin/FaqTable';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata: Metadata = { title: 'FAQ' };

export default async function AdminFaqsPage() {
  const session = await requireStaffSession();

  // Unlike the public homepage/`/faq` (§ resilience — never 500 over
  // a dependency), an admin managing this list needs to know a load
  // actually failed rather than see a silent, misleadingly-empty
  // list — that's what would make them re-add FAQs that already
  // exist once whatever's wrong gets fixed.
  let faqs: { id: string; question: string; answer: string; isActive: boolean }[] = [];
  let loadFailed = false;
  try {
    const results = await faqRepository.listAllByBusiness(session.businessId);
    faqs = results.map(({ id, data }) => ({
      id,
      question: data.question,
      answer: data.answer,
      isActive: data.isActive,
    }));
  } catch {
    loadFailed = true;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-page-title font-bold tracking-tight text-foreground">FAQ</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Shown on the homepage&apos;s FAQ section and the /faq page. Changes appear immediately.
          </p>
        </div>
        {!loadFailed && faqs.length > 0 ? <FaqFormDialog mode="create" /> : null}
      </div>

      {loadFailed ? (
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load FAQs"
          description="This usually means the database isn't fully set up yet for this feature. Reload in a minute, or ask your developer to check the Firestore index for the faqs collection."
        />
      ) : (
        <FaqTable faqs={faqs} />
      )}
    </div>
  );
}
