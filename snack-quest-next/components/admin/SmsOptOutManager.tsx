'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, BellOff, Plus, Undo2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/empty-state';
import { MobileRecordCard, MobileRecordList } from '@/components/admin/MobileRecordCard';
import type { SerializedSmsOptOut } from '@/lib/marketingSms/serialize';
import type { SmsOptOut } from '@/types';

/** Where each entry came from, in words. `customer_link` is the customer themselves; the other two are recorded on their behalf. */
const SOURCE_LABEL: Record<SmsOptOut['source'], string> = {
  customer_link: 'Tapped the link',
  admin: 'Recorded by staff',
  inbound_reply: 'Replied STOP',
};

/**
 * The opt-out register (§ Admin: SMS opt-outs).
 *
 * Adding is available to any admin, because a customer ringing up to
 * ask should be honoured on the spot rather than waiting for a super
 * admin. Removing is super-admin-only and confirmed, because it puts
 * someone who asked to be left alone back into every future campaign —
 * the server enforces both, this only reflects them.
 */
export function SmsOptOutManager({
  optOuts,
  canRemove,
}: {
  optOuts: SerializedSmsOptOut[];
  canRemove: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(optOuts);
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAdd() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/sms-opt-outs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, note }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? 'Could not add that number.');
      }
      setPhone('');
      setNote('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that number.');
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(phoneNumber: string) {
    if (
      !confirm(
        `Put ${phoneNumber} back on the marketing list?\n\nThey asked not to receive marketing texts. Only do this if they have asked to resubscribe, or the entry was a mistake.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/sms-opt-outs/${encodeURIComponent(phoneNumber)}`, { method: 'DELETE' });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? 'Could not remove that number.');
      }
      setRows((prev) => prev.filter((row) => row.phoneNumber !== phoneNumber));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that number.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {error ? (
        <Card className="flex items-start gap-3 border-danger/40 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-sm text-foreground">{error}</p>
        </Card>
      ) : null}

      <Card className="flex flex-col gap-4 p-5">
        <div>
          <p className="text-card-title font-semibold text-foreground">Record an opt-out</p>
          <p className="mt-1 text-sm text-muted-foreground">
            For someone who asked by phone, WhatsApp or in person. They stop receiving marketing texts immediately.
            Order confirmations and delivery updates still reach them.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="opt-out-phone">Phone number</Label>
            <Input
              id="opt-out-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="0712345678"
              className="min-h-11"
            />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="opt-out-note">Note (optional)</Label>
            <Input
              id="opt-out-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Asked on the phone"
              className="min-h-11"
            />
          </div>
          <Button onClick={onAdd} disabled={!phone.trim() || busy} loading={busy} className="min-h-11">
            <Plus className="size-4" aria-hidden="true" />
            Add
          </Button>
        </div>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="Nobody has opted out"
          description="Customers who tap the opt-out link in a marketing text, or ask you directly, will appear here."
        />
      ) : (
        <>
          <MobileRecordList>
            {rows.map((row) => (
              <MobileRecordCard
                key={row.phoneNumber}
                title={row.phoneNumber}
                badge={<Badge variant="outline">{SOURCE_LABEL[row.source]}</Badge>}
                fields={[
                  { label: 'When', value: new Date(row.optedOutAt).toLocaleDateString() },
                  { label: 'Note', value: row.note ?? '—' },
                ]}
                footer={
                  canRemove ? (
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => onRemove(row.phoneNumber)}>
                      <Undo2 className="size-4" aria-hidden="true" />
                      Resubscribe
                    </Button>
                  ) : undefined
                }
              />
            ))}
          </MobileRecordList>

          <Card className="hidden overflow-hidden p-0 md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-border bg-border/20 text-left text-caption uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Number</th>
                    <th className="px-4 py-3 font-medium">How</th>
                    <th className="px-4 py-3 font-medium">Note</th>
                    <th className="px-4 py-3 font-medium">When</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.phoneNumber} className="border-b border-border last:border-0 hover:bg-border/20">
                      <td className="px-4 py-3 font-medium tabular-nums text-foreground">{row.phoneNumber}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{SOURCE_LABEL[row.source]}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{row.note ?? '—'}</td>
                      <td className="px-4 py-3 text-caption text-muted-foreground">
                        {new Date(row.optedOutAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canRemove ? (
                          <Button variant="ghost" size="sm" disabled={busy} onClick={() => onRemove(row.phoneNumber)}>
                            <Undo2 className="size-4" aria-hidden="true" />
                            Resubscribe
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
