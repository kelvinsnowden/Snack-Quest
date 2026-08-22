import type { Metadata } from 'next';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { operationsService } from '@/services/operationsService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { IntegrationStatusBadge } from '@/components/admin/IntegrationStatusBadge';
import { INTEGRATION_PROVIDER_LABELS } from '@/lib/integrations/statusFormat';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDateTime, formatKes } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Operations' };

function Section({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <p className="mt-1 text-caption text-muted-foreground">{description}</p>
          </div>
          <Badge variant={count > 0 ? 'danger' : 'success'}>{count > 0 ? `${count} issue${count === 1 ? '' : 's'}` : 'Clear'}</Badge>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function AdminOperationsPage() {
  const session = await requireStaffSession();
  const snapshot = await operationsService.getSnapshot(session.businessId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Operations</h1>
        <p className="hidden sm:block mt-1 text-sm text-muted-foreground">
          Real signals already recorded across the platform — webhook, payment, integration, and scheduled-job failures,
          plus the manual-booking and expiring-stock queues.
        </p>
      </div>

      <Card className={snapshot.totalIssueCount > 0 ? 'border-warning/40 bg-warning/5' : 'border-success/40 bg-success/5'}>
        <CardContent className="flex items-center gap-3 pt-6">
          {snapshot.totalIssueCount > 0 ? (
            <AlertTriangle className="size-6 text-warning" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="size-6 text-success" aria-hidden="true" />
          )}
          <div>
            <p className="text-2xl font-bold tabular-nums text-foreground">{snapshot.totalIssueCount}</p>
            <p className="text-sm text-muted-foreground">
              {snapshot.totalIssueCount === 0
                ? 'No open issues across webhooks, payments, integrations, or scheduled jobs.'
                : 'Open issues across the sections below.'}
            </p>
          </div>
        </CardContent>
      </Card>

      <Section
        title="Integration failures"
        description="Providers with invalid credentials or a failed connection test."
        count={snapshot.integrationIssues.length}
      >
        {snapshot.integrationIssues.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every configured integration is connected.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {snapshot.integrationIssues.map((issue) => (
              <div key={issue.provider} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{INTEGRATION_PROVIDER_LABELS[issue.provider]}</p>
                  {issue.lastTestError ? <p className="text-caption text-danger">{issue.lastTestError}</p> : null}
                </div>
                <IntegrationStatusBadge status={issue.status} />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Payment failures"
        description="Failed or expired M-Pesa payment intents."
        count={snapshot.failedPaymentIntents.length}
      >
        {snapshot.failedPaymentIntents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No failed or expired payment intents.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-b border-border text-left text-caption text-muted-foreground uppercase">
                <tr>
                  <th className="py-2 pr-4 font-medium">Phone</th>
                  <th className="py-2 pr-4 font-medium">Amount</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.failedPaymentIntents.map(({ id, data }) => (
                  <tr key={id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 tabular-nums text-foreground">{data.phoneNumber}</td>
                    <td className="py-2 pr-4 tabular-nums text-foreground">{formatKes(data.amountKes)}</td>
                    <td className="py-2 pr-4">
                      <Badge variant="danger">{data.status}</Badge>
                    </td>
                    <td className="py-2 text-muted-foreground tabular-nums">{formatDateTime(data.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Abandoned checkout attempts"
        description="Customers whose M-Pesa prompt never went out — usually because a payment provider isn't connected yet."
        count={snapshot.abandonedPaymentIntents.length}
      >
        {snapshot.abandonedPaymentIntents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No abandoned checkout attempts.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="border-b border-border text-left text-caption text-muted-foreground uppercase">
                <tr>
                  <th className="py-2 pr-4 font-medium">Phone</th>
                  <th className="py-2 pr-4 font-medium">Amount</th>
                  <th className="py-2 font-medium">Attempted</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.abandonedPaymentIntents.map(({ id, data }) => (
                  <tr key={id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 tabular-nums text-foreground">{data.phoneNumber}</td>
                    <td className="py-2 pr-4 tabular-nums text-foreground">{formatKes(data.amountKes)}</td>
                    <td className="py-2 text-muted-foreground tabular-nums">{formatDateTime(data.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Webhook failures"
        description="Inbound provider callbacks (Daraja, Whatchimp, TextSMS) that failed to process."
        count={snapshot.failedWebhookEvents.length}
      >
        {snapshot.failedWebhookEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No failed webhook deliveries.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-border text-left text-caption text-muted-foreground uppercase">
                <tr>
                  <th className="py-2 pr-4 font-medium">Provider</th>
                  <th className="py-2 pr-4 font-medium">Kind</th>
                  <th className="py-2 pr-4 font-medium">Error</th>
                  <th className="py-2 font-medium">Received</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.failedWebhookEvents.map(({ id, data }) => (
                  <tr key={id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 capitalize text-foreground">{data.provider}</td>
                    <td className="py-2 pr-4 text-foreground">{data.eventKind.replace(/_/g, ' ')}</td>
                    <td className="py-2 pr-4 text-danger">{data.error ?? '—'}</td>
                    <td className="py-2 text-muted-foreground tabular-nums">{formatDateTime(data.receivedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="System event failures"
        description="Referral, wallet, refund, withdrawal, shipment, and catalog-sync errors recorded across the platform."
        count={snapshot.failedDomainEvents.length}
      >
        {snapshot.failedDomainEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recorded failures.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-border text-left text-caption text-muted-foreground uppercase">
                <tr>
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 font-medium">Reason</th>
                  <th className="py-2 font-medium">Occurred</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.failedDomainEvents.map(({ id, data }) => (
                  <tr key={id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 text-foreground">{data.type}</td>
                    <td className="py-2 pr-4 text-danger">{String(data.payload?.reason ?? '—')}</td>
                    <td className="py-2 text-muted-foreground tabular-nums">{formatDateTime(data.occurredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Manual-booking queue"
        description="Door-delivery shipments waiting on a human agent to book a courier."
        count={snapshot.manualBookingShipments.length}
      >
        {snapshot.manualBookingShipments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing waiting on manual booking.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="border-b border-border text-left text-caption text-muted-foreground uppercase">
                <tr>
                  <th className="py-2 pr-4 font-medium">Order</th>
                  <th className="py-2 pr-4 font-medium">County</th>
                  <th className="py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.manualBookingShipments.map(({ id, data }) => (
                  <tr key={id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 text-foreground">{data.orderId}</td>
                    <td className="py-2 pr-4 text-foreground">{data.county}</td>
                    <td className="py-2 text-muted-foreground tabular-nums">{formatDateTime(data.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Inventory expiring soon"
        description="Batches expiring within 14 days — not a failure, a heads-up for write-off planning."
        count={snapshot.expiringBatches.length}
      >
        {snapshot.expiringBatches.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing expiring in the next 14 days.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="border-b border-border text-left text-caption text-muted-foreground uppercase">
                <tr>
                  <th className="py-2 pr-4 font-medium">Batch</th>
                  <th className="py-2 pr-4 font-medium">Quantity</th>
                  <th className="py-2 font-medium">Expires</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.expiringBatches.map((batch) => (
                  <tr key={batch.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 text-foreground">{batch.packageLabel}</td>
                    <td className="py-2 pr-4 tabular-nums text-foreground">{batch.quantityRemaining}</td>
                    <td className="py-2 text-muted-foreground tabular-nums">{formatDateTime(batch.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Scheduled jobs"
        description="Recent Vercel Cron runs — the notification retry sweep's real run history."
        count={snapshot.scheduledJobRuns.filter((r) => r.data.status === 'failed').length}
      >
        {snapshot.scheduledJobRuns.length === 0 ? (
          <EmptyState icon={AlertTriangle} title="No runs recorded yet" description="This job hasn't run since observability was added." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="border-b border-border text-left text-caption text-muted-foreground uppercase">
                <tr>
                  <th className="py-2 pr-4 font-medium">Job</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Duration</th>
                  <th className="py-2 font-medium">Ran</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.scheduledJobRuns.map(({ id, data }) => (
                  <tr key={id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 text-foreground">{data.jobName}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={data.status === 'succeeded' ? 'success' : 'danger'}>{data.status}</Badge>
                    </td>
                    <td className="py-2 pr-4 tabular-nums text-foreground">{data.durationMs}ms</td>
                    <td className="py-2 text-muted-foreground tabular-nums">{formatDateTime(data.startedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
