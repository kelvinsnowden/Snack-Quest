import type { Metadata } from 'next';
import { requireStaffSession } from '@/lib/auth/session';
import { faqRepository } from '@/repositories/faqRepository';
import { FaqFormDialog } from '@/components/admin/FaqFormDialog';
import { FaqTable } from '@/components/admin/FaqTable';

export const metadata: Metadata = { title: 'FAQ' };

export default async function AdminFaqsPage() {
  const session = await requireStaffSession();
  const faqs = await faqRepository.listAllByBusiness(session.businessId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-page-title font-bold tracking-tight text-foreground">FAQ</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Shown on the homepage&apos;s FAQ section and the /faq page. Changes appear immediately.
          </p>
        </div>
        {faqs.length > 0 ? <FaqFormDialog mode="create" /> : null}
      </div>

      <FaqTable
        faqs={faqs.map(({ id, data }) => ({
          id,
          question: data.question,
          answer: data.answer,
          isActive: data.isActive,
        }))}
      />
    </div>
  );
}
