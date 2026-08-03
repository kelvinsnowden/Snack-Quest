import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { businessSettingsService } from '@/services/businessSettingsService';
import { HomepageContentForm } from '@/components/admin/HomepageContentForm';

export const metadata: Metadata = { title: 'Homepage content' };

export default async function AdminHomepageContentPage() {
  const session = await requireStaffSession();
  const business = await businessSettingsService.getSettings(
    session.businessId,
  );

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <Link
          href="/admin/settings"
          className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Settings
        </Link>
        <h1 className="text-page-title text-foreground font-bold tracking-tight">
          Homepage content
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          The founder portrait and snack flat-lay photos shown on the public
          homepage. Until uploaded, each section shows an on-brand illustrated
          placeholder instead.
        </p>
      </div>

      <HomepageContentForm
        initialValues={{
          founderImageUrl: business.homepageContent?.founderImageUrl ?? null,
          whatsInsidePhotoUrl:
            business.homepageContent?.whatsInsidePhotoUrl ?? null,
        }}
      />
    </div>
  );
}
