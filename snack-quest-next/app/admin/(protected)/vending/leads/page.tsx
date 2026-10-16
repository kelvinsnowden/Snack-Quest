import type { Metadata } from 'next';
import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { vendingLeadService } from '@/services/vendingLeadService';
import { VENDING_LEAD_LIST_LIMIT } from '@/repositories/vendingLeadRepository';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { LeadCard, type LeadRow } from '@/components/admin/vending/LeadCard';
import { ImportOwnApplicationsButton } from '@/components/admin/vending/ImportOwnApplicationsButton';
import { SyncSheetButton } from '@/components/admin/vending/SyncSheetButton';
import { sheetSyncErrorMessage } from '@/lib/leads/sheetSync';
import {
  VENDING_LEAD_SEGMENTS,
  VENDING_LEAD_STATUSES,
  type VendingLeadSegment,
  type VendingLeadStatus,
} from '@/types/vendingLead';

export const metadata: Metadata = { title: 'Leads' };

type Tab = 'active' | 'due' | VendingLeadStatus;

const TABS: { key: Tab; label: string }[] = [
  { key: 'active', label: 'Open' },
  { key: 'due', label: 'Follow-up due' },
  ...VENDING_LEAD_STATUSES.map((status) => ({ key: status.value as Tab, label: status.label })),
];

const CLOSED: ReadonlySet<VendingLeadStatus> = new Set(['won', 'lost']);

/** Opening the page syncs the sheet, but at most this often per server instance. */
const SHEET_SYNC_INTERVAL_MS = 2 * 60 * 1000;
let lastSheetSyncMs = 0;

/** Brings in new rows from the Meta leads sheet before the list is read. Never throws. */
async function syncSheetIfDue(): Promise<string | null> {
  if (Date.now() - lastSheetSyncMs < SHEET_SYNC_INTERVAL_MS) return null;
  lastSheetSyncMs = Date.now();
  try {
    await vendingLeadService.syncFromGoogleSheet();
    return null;
  } catch (error) {
    console.error('[leads page] sheet sync failed', error);
    // Retry on the next page load rather than waiting out the interval.
    lastSheetSyncMs = 0;
    return sheetSyncErrorMessage(error);
  }
}

/** The request's own clock — read once, outside render, so every lead is judged against the same instant. */
function requestTime(): number {
  return Date.now();
}

function tabHref(tab: Tab, segment: string, q: string): string {
  const params = new URLSearchParams({ tab });
  if (segment !== 'all') params.set('segment', segment);
  if (q) params.set('q', q);
  return `/admin/vending/leads?${params.toString()}`;
}

/**
 * The vending leads CRM (§ vending leads CRM) — everyone who asked
 * about owning or hosting a machine, from Meta lead forms (pushed in
 * from the Google Sheet) and the website's `/own` form, in one list
 * that can actually be worked: stage, type, follow-up date, notes, and
 * one tap to WhatsApp them.
 */
export default async function VendingLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; segment?: string; q?: string }>;
}) {
  const session = await requireStaffSession();
  const canManage = hasPermission(session, 'owners.manage');
  const params = await searchParams;
  const tab: Tab = TABS.some((entry) => entry.key === params.tab) ? (params.tab as Tab) : 'active';
  const segment: VendingLeadSegment | 'all' = VENDING_LEAD_SEGMENTS.some((s) => s.value === params.segment)
    ? (params.segment as VendingLeadSegment)
    : 'all';
  const q = (params.q ?? '').trim().slice(0, 80);

  const syncError = await syncSheetIfDue();
  const entries = await vendingLeadService.listRecent();
  const now = requestTime();
  const serviceAccountEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL ?? 'the Firebase service account';

  const all: LeadRow[] = entries.map(({ id, data }) => ({
    id,
    source: data.source,
    fullName: data.fullName,
    phone: data.phone,
    email: data.email,
    campaignName: data.campaignName,
    adName: data.adName,
    formName: data.formName,
    platform: data.platform,
    answers: data.answers ?? [],
    submittedAtMs: data.submittedAtMs,
    status: data.status,
    segment: data.segment,
    nextFollowUpAtMs: data.nextFollowUpAtMs ?? null,
    notes: (data.notes ?? []).map((note) => ({ text: note.text, byName: note.byName, atMs: note.atMs })),
    followUpDue:
      data.nextFollowUpAtMs !== null && data.nextFollowUpAtMs !== undefined && data.nextFollowUpAtMs <= now && !CLOSED.has(data.status),
  }));

  const isDue = (lead: LeadRow) => lead.followUpDue;

  const counts = new Map<Tab, number>();
  counts.set('active', all.filter((lead) => !CLOSED.has(lead.status)).length);
  counts.set('due', all.filter(isDue).length);
  for (const status of VENDING_LEAD_STATUSES) {
    counts.set(status.value, all.filter((lead) => lead.status === status.value).length);
  }

  const needle = q.toLowerCase();
  const digits = q.replace(/\D/g, '');
  const visible = all
    .filter((lead) => {
      if (tab === 'active') return !CLOSED.has(lead.status);
      if (tab === 'due') return isDue(lead);
      return lead.status === tab;
    })
    .filter((lead) => segment === 'all' || lead.segment === segment)
    .filter((lead) => {
      if (!needle) return true;
      return (
        lead.fullName.toLowerCase().includes(needle) ||
        (lead.email ?? '').includes(needle) ||
        (digits.length >= 3 && lead.phone.includes(digits)) ||
        (lead.campaignName ?? '').toLowerCase().includes(needle)
      );
    });

  if (tab === 'due') {
    visible.sort((a, b) => (a.nextFollowUpAtMs ?? 0) - (b.nextFollowUpAtMs ?? 0));
  }

  const newToday = all.filter((lead) => now - lead.submittedAtMs < 24 * 60 * 60 * 1000).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl md:text-3xl text-foreground font-bold tracking-tight">Leads</h1>
        {canManage ? <SyncSheetButton /> : null}
      </div>

      {syncError ? (
        <p role="alert" className="border-warning/40 bg-warning/5 text-foreground rounded-lg border p-3 text-sm">
          {syncError}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'New, not contacted', value: counts.get('new') ?? 0 },
          { label: 'Follow-ups due', value: counts.get('due') ?? 0 },
          { label: 'Last 24 hours', value: newToday },
          { label: 'Won', value: counts.get('won') ?? 0 },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-muted-foreground text-xs">{stat.label}</p>
            <p className="text-foreground mt-1 text-2xl font-bold tabular-nums">{stat.value}</p>
          </Card>
        ))}
      </div>

      <div className="border-border flex flex-wrap gap-2 border-b pb-3">
        {TABS.map((entry) => (
          <Link
            key={entry.key}
            href={tabHref(entry.key, segment, q)}
            className={`inline-flex min-h-10 items-center rounded-full px-3.5 text-sm font-medium transition-colors ${
              tab === entry.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-border/40'
            }`}
          >
            {entry.label}
            {(counts.get(entry.key) ?? 0) > 0 ? ` (${counts.get(entry.key)})` : ''}
          </Link>
        ))}
      </div>

      <form method="get" action="/admin/vending/leads" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="tab" value={tab} />
        <Input name="q" defaultValue={q} placeholder="Search name, phone, email or campaign" className="min-w-0 flex-1 sm:max-w-sm" />
        <select
          name="segment"
          defaultValue={segment}
          className="border-border bg-background text-foreground h-10 rounded-md border px-3 text-sm"
        >
          <option value="all">All types</option>
          {VENDING_LEAD_SEGMENTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button type="submit" className="text-primary h-10 px-3 text-sm font-medium">
          Filter
        </button>
      </form>

      {visible.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={all.length === 0 ? 'No leads yet' : 'Nothing in this view'}
          description={
            all.length === 0
              ? 'Leads from the Google Sheet appear here once it is connected (see below).'
              : 'Try another tab or clear the search.'
          }
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visible.map((lead) => (
            <LeadCard key={lead.id} lead={lead} canManage={canManage} />
          ))}
        </div>
      )}

      {all.length >= VENDING_LEAD_LIST_LIMIT ? (
        <p className="text-muted-foreground text-xs">Showing the newest {VENDING_LEAD_LIST_LIMIT} leads.</p>
      ) : null}

      <details className="border-border rounded-lg border p-5">
        <summary className="text-foreground cursor-pointer text-sm font-medium">Connect the Google Sheet</summary>
        <div className="text-muted-foreground mt-4 flex flex-col gap-3 text-sm">
          <p>
            The site reads the sheet itself each time this page opens, and once a day. The sheet stays private.
          </p>
          <ol className="list-decimal flex flex-col gap-1 pl-5">
            <li>
              Share the sheet (Viewer) with <code className="text-foreground">{serviceAccountEmail}</code>.
            </li>
            <li>
              In Vercel, set <code className="text-foreground">LEADS_SHEET_ID</code> to the long ID in the sheet’s link
              (between <code>/d/</code> and <code>/edit</code>), then redeploy.
            </li>
            <li>Turn on the Google Sheets API for the same Google Cloud project, if it isn’t already.</li>
          </ol>
          {canManage ? <ImportOwnApplicationsButton /> : null}
        </div>
      </details>
    </div>
  );
}
