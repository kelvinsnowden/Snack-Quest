'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  VENDING_LEAD_SEGMENTS,
  VENDING_LEAD_SOURCE_LABELS,
  VENDING_LEAD_STATUSES,
  type VendingLeadSegment,
  type VendingLeadSource,
  type VendingLeadStatus,
} from '@/types/vendingLead';

/** Plain, serializable lead — Firestore Timestamps cannot cross into a Client Component. */
export interface LeadRow {
  id: string;
  source: VendingLeadSource;
  fullName: string;
  phone: string;
  email: string | null;
  campaignName: string | null;
  adName: string | null;
  formName: string | null;
  platform: string | null;
  answers: { label: string; value: string }[];
  submittedAtMs: number;
  status: VendingLeadStatus;
  segment: VendingLeadSegment;
  nextFollowUpAtMs: number | null;
  notes: { text: string; byName: string | null; atMs: number }[];
  call: { atMs: number; whatsapp: string } | null;
  /** One line on where the automatic emails stand for this lead. */
  emails: string;
  emailsActive: boolean;
  /** Computed on the server against the request's clock. */
  followUpDue: boolean;
}

const STATUS_VARIANT: Record<VendingLeadStatus, 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'outline'> = {
  new: 'warning',
  contacted: 'default',
  qualified: 'secondary',
  site_visit: 'secondary',
  won: 'success',
  lost: 'outline',
};

const SELECT_CLASS =
  'border-border bg-background text-foreground h-10 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString('en-KE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Nairobi',
  });
}

/** `yyyy-mm-dd` in Nairobi time, for `<input type="date">`. */
function toDateInput(ms: number | null): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
}

/** 9am Nairobi on the chosen day. */
function fromDateInput(value: string): number | null {
  if (!value) return null;
  const ms = Date.parse(`${value}T09:00:00+03:00`);
  return Number.isFinite(ms) ? ms : null;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? '';
}

export function LeadCard({ lead, canManage }: { lead: LeadRow; canManage: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const statusLabel = VENDING_LEAD_STATUSES.find((s) => s.value === lead.status)?.label ?? lead.status;
  const segmentLabel = VENDING_LEAD_SEGMENTS.find((s) => s.value === lead.segment)?.label ?? lead.segment;
  const whatsappText = `Hi ${firstName(lead.fullName)}, this is Kelvin from Snack Quest. Thanks for your interest in our vending machine founding-partner programme! Is now a good time for a quick chat?`;

  async function save(patch: Record<string, unknown>): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/vending/leads/${encodeURIComponent(lead.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? 'That didn’t save. Please try again.');
      }
      router.refresh();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That didn’t save. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-foreground truncate text-base font-semibold">{lead.fullName}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {formatDateTime(lead.submittedAtMs)} · {VENDING_LEAD_SOURCE_LABELS[lead.source]}
            {lead.platform ? ` (${lead.platform})` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={STATUS_VARIANT[lead.status]}>{statusLabel}</Badge>
          <Badge variant="outline">{segmentLabel}</Badge>
          {lead.call ? <Badge variant="success">Call {formatDateTime(lead.call.atMs)}</Badge> : null}
          {lead.followUpDue ? (
            <Badge variant="danger">Follow-up due</Badge>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {lead.phone ? (
          <>
            <Button asChild size="sm">
              <a
                href={`https://wa.me/${lead.phone.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappText)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="size-4" />
                WhatsApp
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={`tel:+${lead.phone.replace(/\D/g, '')}`}>
                <Phone className="size-4" />
                {lead.phone}
              </a>
            </Button>
          </>
        ) : null}
        {lead.email ? (
          <Button asChild size="sm" variant="outline">
            <a href={`mailto:${lead.email}`}>
              <Mail className="size-4" />
              {lead.email}
            </a>
          </Button>
        ) : null}
      </div>

      {lead.campaignName || lead.adName || lead.formName ? (
        <p className="text-muted-foreground text-xs">
          {[lead.campaignName && `Campaign: ${lead.campaignName}`, lead.adName && `Ad: ${lead.adName}`, lead.formName && `Form: ${lead.formName}`]
            .filter(Boolean)
            .join(' · ')}
        </p>
      ) : null}

      {lead.answers.length > 0 ? (
        <dl className="border-border grid gap-x-4 gap-y-2 rounded-lg border p-3 text-sm sm:grid-cols-2">
          {lead.answers.map((answer, index) => (
            <div key={`${answer.label}-${index}`} className="min-w-0">
              <dt className="text-muted-foreground text-xs">{answer.label}</dt>
              <dd className="text-foreground break-words">{answer.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <Mail className="size-3.5" aria-hidden="true" />
          {lead.emails}
        </span>
        {canManage && lead.emailsActive ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => save({ stopEmails: true })}
            className="text-primary font-medium hover:underline disabled:opacity-50"
          >
            Stop emails
          </button>
        ) : null}
      </div>

      {lead.notes.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {[...lead.notes].reverse().map((entry, index) => (
            <li key={`${entry.atMs}-${index}`} className="bg-border/30 rounded-md px-3 py-2 text-sm">
              <p className="text-foreground whitespace-pre-wrap">{entry.text}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {entry.byName ?? 'Staff'} · {formatDateTime(entry.atMs)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {canManage ? (
        <div className="border-border flex flex-col gap-3 border-t pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Stage
              <select
                className={SELECT_CLASS}
                value={lead.status}
                disabled={saving}
                onChange={(event) => void save({ status: event.target.value })}
              >
                {VENDING_LEAD_STATUSES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Type
              <select
                className={SELECT_CLASS}
                value={lead.segment}
                disabled={saving}
                onChange={(event) => void save({ segment: event.target.value })}
              >
                {VENDING_LEAD_SEGMENTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Follow up on
              <input
                type="date"
                className={SELECT_CLASS}
                defaultValue={toDateInput(lead.nextFollowUpAtMs)}
                disabled={saving}
                onChange={(event) => void save({ nextFollowUpAtMs: fromDateInput(event.target.value) })}
              />
            </label>
          </div>

          <form
            className="flex flex-col gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!note.trim()) return;
              if (await save({ note })) setNote('');
            }}
          >
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Add a note — what they said, what's next…"
              rows={2}
              maxLength={2000}
              disabled={saving}
            />
            <div className="flex items-center justify-between gap-3">
              {error ? (
                <p role="alert" className="text-danger text-sm">
                  {error}
                </p>
              ) : (
                <span />
              )}
              <Button type="submit" size="sm" variant="outline" disabled={saving || !note.trim()}>
                {saving ? 'Saving…' : 'Add note'}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </Card>
  );
}
