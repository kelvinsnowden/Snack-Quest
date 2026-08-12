import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldAlert, ChevronRight } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { notificationTemplateService } from '@/services/notificationTemplateService';
import { templateEventLabel } from '@/lib/notifications/templateLabels';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Notification Templates' };

const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  in_app: 'In-app',
};

export default async function NotificationTemplatesPage() {
  const session = await requireStaffSession();

  if (!isSuperAdmin(session)) {
    return (
      <div className="flex max-w-2xl flex-col gap-6">
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Notification Templates</h1>
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <ShieldAlert className="size-8 text-warning" aria-hidden="true" />
          <p className="text-card-title font-semibold text-foreground">Super admin access required</p>
          <p className="text-sm text-muted-foreground">
            These templates fire automatically for real creators and staff — only a super admin can edit them.
          </p>
        </Card>
      </div>
    );
  }

  const templates = await notificationTemplateService.listAll();
  const byChannel = new Map<string, typeof templates>();
  for (const template of templates) {
    const list = byChannel.get(template.channel) ?? [];
    list.push(template);
    byChannel.set(template.channel, list);
  }
  const channels = ['email', 'sms', 'whatsapp', 'in_app'].filter((c) => byChannel.has(c));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Notification Templates</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The real content that fires automatically for creator and staff events — welcome, approval, commission, withdrawals, and more.
          Turn one off to silently skip that event&apos;s message without touching the flow it&apos;s attached to.
        </p>
      </div>

      {channels.map((channel) => (
        <Card key={channel} className="overflow-hidden p-0">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">{CHANNEL_LABEL[channel] ?? channel}</h2>
          </div>
          <ul className="divide-y divide-border">
            {(byChannel.get(channel) ?? []).map((template) => (
              <li key={template.templateCode}>
                <Link
                  href={`/admin/notification-templates/${template.templateCode}`}
                  className="flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-border/10"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">{templateEventLabel(template.templateCode)}</span>
                    <span className="text-xs text-muted-foreground">{template.templateCode}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={template.isActive ? 'success' : 'outline'}>
                      {template.isActive ? 'Active' : 'Disabled'}
                    </Badge>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
