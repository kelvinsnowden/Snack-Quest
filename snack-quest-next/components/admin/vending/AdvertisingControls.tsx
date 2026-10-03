'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AD_BILLING_LABEL,
  AD_BILLING_MODELS,
  type AdBillingModel,
  type AdCampaignStatus,
  type AdSchedule,
  type AdTargeting,
} from '@/types/advertising';

type Result = { ok: boolean; text: string } | null;
const selectClass =
  'min-h-10 w-full rounded-md border border-border bg-surface px-2 text-sm';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

async function send(
  url: string,
  method: 'POST' | 'PATCH',
  body: unknown,
): Promise<Record<string, unknown>> {
  const init: RequestInit =
    body instanceof FormData
      ? { method, body }
      : {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        };
  const response = await fetch(url, init);
  const data = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!response.ok)
    throw new Error(
      (data?.error as string) ?? `Couldn’t save (HTTP ${response.status}).`,
    );
  return data ?? {};
}

function Message({ result }: { result: Result }) {
  if (!result) return null;
  return (
    <p
      role={result.ok ? 'status' : 'alert'}
      className={`flex items-start gap-2 text-sm ${result.ok ? 'text-success' : 'text-danger'}`}
    >
      {result.ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      )}
      {result.text}
    </p>
  );
}

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);
  async function run(label: string, action: () => Promise<string>) {
    setBusy(label);
    setResult(null);
    try {
      setResult({ ok: true, text: await action() });
      router.refresh();
    } catch (error) {
      setResult({
        ok: false,
        text: error instanceof Error ? error.message : 'Something went wrong.',
      });
    } finally {
      setBusy(null);
    }
  }
  return { busy, result, run };
}

const toTime = (minute: number) =>
  `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const fromTime = (value: string, fallback: number) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
};

/** Adds an advertiser (`advertising.manage`). */
export function AdvertiserForm() {
  const { busy, result, run } = useAction();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'external' | 'internal'>('external');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        void run('add', async () => {
          await send('/api/vending/advertising/advertisers', 'POST', {
            name,
            kind,
            contactName,
            contactEmail,
            contactPhone,
          });
          setName('');
          setContactName('');
          setContactEmail('');
          setContactPhone('');
          return 'Advertiser added.';
        });
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Name</span>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-h-10"
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Kind</span>
        <select
          className={selectClass}
          value={kind}
          onChange={(event) => setKind(event.target.value as typeof kind)}
        >
          <option value="external">A brand that pays to advertise</option>
          <option value="internal">Snack Quest itself (never billed)</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Contact name</span>
        <Input
          value={contactName}
          onChange={(event) => setContactName(event.target.value)}
          className="min-h-10"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Contact email</span>
        <Input
          type="email"
          value={contactEmail}
          onChange={(event) => setContactEmail(event.target.value)}
          className="min-h-10"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Contact phone</span>
        <Input
          value={contactPhone}
          onChange={(event) => setContactPhone(event.target.value)}
          className="min-h-10"
        />
      </label>
      <div className="flex items-end">
        <Button type="submit" loading={busy === 'add'} disabled={!name.trim()}>
          Add advertiser
        </Button>
      </div>
      <div className="sm:col-span-2">
        <Message result={result} />
      </div>
    </form>
  );
}

/** Uploads a creative for review (`advertising.manage`). The server checks the file and computes its checksum. */
export function CreativeUploadForm({
  advertisers,
}: {
  advertisers: { id: string; name: string }[];
}) {
  const { busy, result, run } = useAction();
  const [advertiserId, setAdvertiserId] = useState(advertisers[0]?.id ?? '');
  const [name, setName] = useState('');
  const [seconds, setSeconds] = useState('8');
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!file) return;
        void run('upload', async () => {
          const form = new FormData();
          form.set('file', file);
          form.set('advertiserId', advertiserId);
          form.set('name', name);
          form.set('durationSeconds', seconds);
          await send('/api/vending/advertising/creatives', 'POST', form);
          setName('');
          setFile(null);
          setInputKey((key) => key + 1);
          return 'Uploaded. It plays nowhere until someone approves it.';
        });
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Advertiser</span>
        <select
          className={selectClass}
          value={advertiserId}
          onChange={(event) => setAdvertiserId(event.target.value)}
        >
          {advertisers.map((advertiser) => (
            <option key={advertiser.id} value={advertiser.id}>
              {advertiser.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Name</span>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-h-10"
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">File</span>
        <input
          key={inputKey}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="min-h-10 text-sm"
        />
        <span className="text-caption text-muted-foreground">
          JPG, PNG, WebP, MP4 or WebM, under 4 MB.
        </span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Seconds on screen</span>
        <Input
          inputMode="numeric"
          value={seconds}
          onChange={(event) => setSeconds(event.target.value)}
          className="min-h-10 tabular-nums"
        />
        <span className="text-caption text-muted-foreground">
          Images 3–30 s. For a video, its length (1–60 s).
        </span>
      </label>
      <div className="sm:col-span-2">
        <Button
          type="submit"
          loading={busy === 'upload'}
          disabled={!file || !name.trim() || !advertiserId}
        >
          Upload for review
        </Button>
      </div>
      <div className="sm:col-span-2">
        <Message result={result} />
      </div>
    </form>
  );
}

/** Approve or reject one creative (`advertising.review`). */
export function CreativeReview({
  creativeId,
  status,
}: {
  creativeId: string;
  status: 'pending_review' | 'approved' | 'rejected';
}) {
  const { busy, result, run } = useAction();
  const [note, setNote] = useState('');
  if (status === 'rejected') return null;
  const decide = (decision: 'approved' | 'rejected') =>
    run(decision, async () => {
      await send(
        `/api/vending/advertising/creatives/${creativeId}/review`,
        'POST',
        { decision, note },
      );
      return decision === 'approved'
        ? 'Approved.'
        : 'Rejected — it stops on every machine at the next sync.';
    });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Reason"
          placeholder={
            status === 'approved' ? 'Why pull it?' : 'Reason (needed to reject)'
          }
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="min-h-9 w-56"
        />
        {status === 'pending_review' ? (
          <Button
            size="sm"
            loading={busy === 'approved'}
            disabled={Boolean(busy)}
            onClick={() => decide('approved')}
          >
            Approve
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          loading={busy === 'rejected'}
          disabled={Boolean(busy) || !note.trim()}
          onClick={() => decide('rejected')}
        >
          {status === 'approved' ? 'Pull it' : 'Reject'}
        </Button>
      </div>
      <Message result={result} />
    </div>
  );
}

export interface CampaignFormValues {
  advertiserId: string;
  name: string;
  creativeIds: string[];
  schedule: AdSchedule;
  targeting: AdTargeting;
  weight: number;
  frequencyCapPerHour: number | null;
  billingModel: AdBillingModel;
  priceKes: number;
}

type Option = { id: string; name: string };

/** A scrollable checklist of machines, locations or owners to aim a campaign at. */
function TargetList({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  if (options.length === 0) return null;
  const toggle = (id: string, on: boolean) =>
    onChange(
      on
        ? [...new Set([...selected, id])]
        : selected.filter((entry) => entry !== id),
    );
  return (
    <fieldset className="flex flex-col gap-1 text-sm">
      <legend className="font-medium">{label}</legend>
      <div className="border-border flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border p-2">
        {options.map((option) => (
          <label key={option.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selected.includes(option.id)}
              onChange={(event) => toggle(option.id, event.target.checked)}
            />
            {option.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Creates a draft campaign or edits a draft/paused one (`advertising.manage`). */
export function CampaignForm({
  campaignId,
  initial,
  advertisers,
  creatives,
  machines,
  locations,
  owners,
  today,
}: {
  campaignId?: string;
  initial?: CampaignFormValues;
  advertisers: (Option & { kind: 'external' | 'internal' })[];
  creatives: (Option & { advertiserId: string; status: string })[];
  machines: Option[];
  locations: Option[];
  owners: Option[];
  today: string;
}) {
  const { busy, result, run } = useAction();
  const [values, setValues] = useState<CampaignFormValues>(
    initial ?? {
      advertiserId: advertisers[0]?.id ?? '',
      name: '',
      creativeIds: [],
      schedule: {
        startDate: today,
        endDate: null,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startMinute: 0,
        endMinute: 1440,
      },
      targeting: {
        allMachines: true,
        machineIds: [],
        locationIds: [],
        ownerPartnerIds: [],
      },
      weight: 1,
      frequencyCapPerHour: null,
      billingModel: 'none',
      priceKes: 0,
    },
  );
  const advertiser = advertisers.find(
    (entry) => entry.id === values.advertiserId,
  );
  const usable = creatives.filter(
    (creative) =>
      creative.advertiserId === values.advertiserId &&
      creative.status !== 'rejected',
  );
  const set = (patch: Partial<CampaignFormValues>) =>
    setValues((current) => ({ ...current, ...patch }));
  const setSchedule = (patch: Partial<AdSchedule>) =>
    setValues((current) => ({
      ...current,
      schedule: { ...current.schedule, ...patch },
    }));
  const setTargeting = (patch: Partial<AdTargeting>) =>
    setValues((current) => ({
      ...current,
      targeting: { ...current.targeting, ...patch },
    }));
  const multi = (list: string[], id: string, on: boolean) =>
    on ? [...new Set([...list, id])] : list.filter((entry) => entry !== id);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void run('save', async () => {
          if (campaignId) {
            const { advertiserId: _unused, ...rest } = values;
            void _unused;
            await send(
              `/api/vending/advertising/campaigns/${campaignId}`,
              'PATCH',
              rest,
            );
            return 'Saved.';
          }
          await send('/api/vending/advertising/campaigns', 'POST', values);
          set({ name: '', creativeIds: [] });
          return 'Draft campaign created. Start it when its creatives are approved.';
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Advertiser</span>
          <select
            className={selectClass}
            disabled={Boolean(campaignId)}
            value={values.advertiserId}
            onChange={(event) =>
              set({
                advertiserId: event.target.value,
                creativeIds: [],
                billingModel: 'none',
                priceKes: 0,
              })
            }
          >
            {advertisers.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
                {entry.kind === 'internal' ? ' (Snack Quest)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Campaign name</span>
          <Input
            value={values.name}
            onChange={(event) => set({ name: event.target.value })}
            className="min-h-10"
            required
          />
        </label>
      </div>

      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="font-medium">Creatives (rotated in turn)</legend>
        {usable.length === 0 ? (
          <p className="text-muted-foreground">
            Upload a creative for this advertiser first.
          </p>
        ) : null}
        {usable.map((creative) => (
          <label key={creative.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={values.creativeIds.includes(creative.id)}
              onChange={(event) =>
                set({
                  creativeIds: multi(
                    values.creativeIds,
                    creative.id,
                    event.target.checked,
                  ),
                })
              }
            />
            {creative.name}
            {creative.status === 'pending_review' ? (
              <span className="text-caption text-warning">awaiting review</span>
            ) : null}
          </label>
        ))}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">From</span>
          <Input
            type="date"
            value={values.schedule.startDate}
            onChange={(event) => setSchedule({ startDate: event.target.value })}
            className="min-h-10"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Until (optional)</span>
          <Input
            type="date"
            value={values.schedule.endDate ?? ''}
            onChange={(event) =>
              setSchedule({ endDate: event.target.value || null })
            }
            className="min-h-10"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Daily from</span>
          <Input
            type="time"
            value={toTime(values.schedule.startMinute)}
            onChange={(event) =>
              setSchedule({ startMinute: fromTime(event.target.value, 0) })
            }
            className="min-h-10"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Daily until</span>
          <Input
            type="time"
            value={
              values.schedule.endMinute >= 1440
                ? '23:59'
                : toTime(values.schedule.endMinute)
            }
            onChange={(event) =>
              setSchedule({
                endMinute:
                  event.target.value === '23:59'
                    ? 1440
                    : fromTime(event.target.value, 1440),
              })
            }
            className="min-h-10"
          />
        </label>
      </div>
      <fieldset className="flex flex-wrap items-center gap-3 text-sm">
        <legend className="mb-1 font-medium">Days (Nairobi time)</legend>
        {DAYS.map((day, index) => (
          <label key={day} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={values.schedule.daysOfWeek.includes(index)}
              onChange={(event) =>
                setSchedule({
                  daysOfWeek: event.target.checked
                    ? [...values.schedule.daysOfWeek, index].sort()
                    : values.schedule.daysOfWeek.filter((d) => d !== index),
                })
              }
            />
            {day}
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="font-medium">Where it plays</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={values.targeting.allMachines}
            onChange={() => setTargeting({ allMachines: true })}
          />
          Every machine (whose screen design allows ads)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={!values.targeting.allMachines}
            onChange={() => setTargeting({ allMachines: false })}
          />
          Only these machines, locations or owners’ machines
        </label>
        {!values.targeting.allMachines ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <TargetList
              label="Machines"
              options={machines}
              selected={values.targeting.machineIds}
              onChange={(machineIds) => setTargeting({ machineIds })}
            />
            <TargetList
              label="Locations"
              options={locations}
              selected={values.targeting.locationIds}
              onChange={(locationIds) => setTargeting({ locationIds })}
            />
            <TargetList
              label="Owners"
              options={owners}
              selected={values.targeting.ownerPartnerIds}
              onChange={(ownerPartnerIds) => setTargeting({ ownerPartnerIds })}
            />
          </div>
        ) : null}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Weight (1–10)</span>
          <Input
            type="number"
            min={1}
            max={10}
            value={values.weight}
            onChange={(event) => set({ weight: Number(event.target.value) })}
            className="min-h-10 tabular-nums"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Max plays per machine per hour</span>
          <Input
            type="number"
            min={1}
            max={60}
            value={values.frequencyCapPerHour ?? ''}
            placeholder="No cap"
            onChange={(event) =>
              set({
                frequencyCapPerHour: event.target.value
                  ? Number(event.target.value)
                  : null,
              })
            }
            className="min-h-10 tabular-nums"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Billing</span>
          <select
            className={selectClass}
            disabled={advertiser?.kind === 'internal'}
            value={values.billingModel}
            onChange={(event) =>
              set({ billingModel: event.target.value as AdBillingModel })
            }
          >
            {AD_BILLING_MODELS.map((model) => (
              <option key={model} value={model}>
                {AD_BILLING_LABEL[model]}
              </option>
            ))}
          </select>
        </label>
        {values.billingModel !== 'none' ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Price (KES per unit)</span>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={values.priceKes || ''}
              onChange={(event) =>
                set({ priceKes: Number(event.target.value) })
              }
              className="min-h-10 tabular-nums"
            />
          </label>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          loading={busy === 'save'}
          disabled={!values.name.trim() || !values.advertiserId}
        >
          {campaignId ? 'Save changes' : 'Create draft campaign'}
        </Button>
        <Message result={result} />
      </div>
    </form>
  );
}

/** Start, pause, end or cancel a campaign (`advertising.publish`). */
export function CampaignStatusActions({
  campaignId,
  status,
}: {
  campaignId: string;
  status: AdCampaignStatus;
}) {
  const { busy, result, run } = useAction();
  const actions: {
    action: 'start' | 'pause' | 'end' | 'cancel';
    label: string;
    show: boolean;
    variant: 'primary' | 'outline' | 'ghost';
  }[] = [
    {
      action: 'start',
      label: status === 'paused' ? 'Resume' : 'Start',
      show: status === 'draft' || status === 'paused',
      variant: 'primary',
    },
    {
      action: 'pause',
      label: 'Pause',
      show: status === 'active',
      variant: 'outline',
    },
    {
      action: 'end',
      label: 'End',
      show: status === 'active' || status === 'paused',
      variant: 'ghost',
    },
    {
      action: 'cancel',
      label: 'Cancel',
      show: status === 'draft',
      variant: 'ghost',
    },
  ];
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1">
        {actions
          .filter((entry) => entry.show)
          .map((entry) => (
            <Button
              key={entry.action}
              size="sm"
              variant={entry.variant}
              loading={busy === entry.action}
              disabled={Boolean(busy)}
              onClick={() =>
                run(entry.action, async () => {
                  const response = await send(
                    `/api/vending/advertising/campaigns/${campaignId}/status`,
                    'POST',
                    { action: entry.action },
                  );
                  return `Now ${response.status}.`;
                })
              }
            >
              {entry.label}
            </Button>
          ))}
      </div>
      <Message result={result} />
    </div>
  );
}

/** Works out a month's advertising revenue and owner shares from playback (finance). */
export function ComputeRevenueButton({ month }: { month: string }) {
  const { busy, result, run } = useAction();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        loading={busy === 'compute'}
        onClick={() =>
          run('compute', async () => {
            const response = await send(
              `/api/vending/advertising/revenue?month=${month}`,
              'POST',
              {},
            );
            return `Worked out ${(response.entries as unknown[]).length} campaign(s) for ${month}.`;
          })
        }
      >
        Work out {month} from playback
      </Button>
      <Message result={result} />
    </div>
  );
}

/** Pauses or restores an advertiser (`advertising.manage`). An inactive advertiser can't start new campaigns. */
export function AdvertiserActiveToggle({
  advertiserId,
  active,
}: {
  advertiserId: string;
  active: boolean;
}) {
  const { busy, result, run } = useAction();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        loading={busy === 'toggle'}
        onClick={() =>
          run('toggle', async () => {
            await send(
              `/api/vending/advertising/advertisers/${advertiserId}`,
              'PATCH',
              { active: !active },
            );
            return active
              ? 'Advertiser made inactive.'
              : 'Advertiser active again.';
          })
        }
      >
        {active ? 'Make inactive' : 'Make active'}
      </Button>
      <Message result={result} />
    </div>
  );
}
