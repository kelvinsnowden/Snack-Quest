import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { notificationTemplateService, NotificationTemplateNotFoundError } from '@/services/notificationTemplateService';
import { templateEventLabel } from '@/lib/notifications/templateLabels';
import { NotificationTemplateForm } from '@/components/admin/NotificationTemplateForm';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Edit notification template' };

export default async function NotificationTemplateEditPage({ params }: { params: Promise<{ code: string }> }) {
  const session = await requireStaffSession();
  const { code } = await params;

  if (!isSuperAdmin(session)) {
    return (
      <Card className="flex max-w-2xl flex-col items-center gap-3 p-10 text-center">
        <ShieldAlert className="size-8 text-warning" aria-hidden="true" />
        <p className="text-card-title font-semibold text-foreground">Super admin access required</p>
      </Card>
    );
  }

  let template;
  try {
    template = await notificationTemplateService.getByCode(code);
  } catch (error) {
    if (error instanceof NotificationTemplateNotFoundError) {
      notFound();
    }
    throw error;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">{templateEventLabel(template.templateCode)}</h1>
        <p className="hidden sm:block mt-1 text-sm text-muted-foreground">{template.templateCode} · version {template.version}</p>
      </div>
      <NotificationTemplateForm
        templateCode={template.templateCode}
        channel={template.channel}
        requiredParams={template.requiredParams}
        initialValues={{
          subject: template.subject ?? '',
          heading: template.heading ?? '',
          bodyTemplate: template.bodyTemplate,
          ctaLabel: template.ctaLabel ?? '',
          ctaUrl: template.ctaUrl ?? '',
          isActive: template.isActive,
        }}
      />
    </div>
  );
}
