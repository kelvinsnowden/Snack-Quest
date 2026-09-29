'use client';

import { useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Result = { ok: boolean; text: string } | null;

async function send(
  url: string,
  method: 'POST' | 'PATCH',
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!response.ok)
    throw new Error(
      (data?.message as string) ??
        (data?.error as string) ??
        `Couldn't save (HTTP ${response.status}).`,
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

export interface OwnerFormValues {
  name: string;
  contactEmail: string;
  contactPhone: string;
  note: string;
}

/**
 * Add or edit a machine owner. The email is how they claim their owner
 * portal, so it has to be theirs and no other owner's; once they've
 * claimed it, changing it here doesn't move their sign-in.
 */
export function OwnerForm({
  partnerId,
  initial,
  claimed,
  canEdit,
}: {
  partnerId: string | null;
  initial: OwnerFormValues;
  claimed: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const set =
    (key: keyof OwnerFormValues) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setResult(null);
      setValues((current) => ({ ...current, [key]: event.target.value }));
    };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const body = {
        name: values.name,
        contactEmail: values.contactEmail.trim() || null,
        contactPhone: values.contactPhone.trim() || null,
        note: values.note.trim() || null,
      };
      const data = await send(
        partnerId
          ? `/api/vending/partners/${partnerId}`
          : '/api/vending/partners',
        partnerId ? 'PATCH' : 'POST',
        body,
      );
      if (!partnerId && typeof data.partnerId === 'string') {
        router.push(`/admin/vending/partners/${data.partnerId}`);
        return;
      }
      setResult({ ok: true, text: 'Saved.' });
      router.refresh();
    } catch (error) {
      setResult({
        ok: false,
        text: error instanceof Error ? error.message : "Couldn't save.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <fieldset
        disabled={!canEdit || busy}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="owner-name">Name</Label>
          <Input
            id="owner-name"
            value={values.name}
            onChange={set('name')}
            placeholder="Person or company"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="owner-email">Email</Label>
          <Input
            id="owner-email"
            type="email"
            value={values.contactEmail}
            onChange={set('contactEmail')}
            autoComplete="off"
          />
          <p className="text-muted-foreground text-xs">
            {claimed
              ? 'Contact only — they already sign in with their own account.'
              : 'They sign up to the owner portal with this address.'}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="owner-phone">Phone</Label>
          <Input
            id="owner-phone"
            type="tel"
            value={values.contactPhone}
            onChange={set('contactPhone')}
            placeholder="07xx xxx xxx"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="owner-note">Note (staff only)</Label>
          <Textarea
            id="owner-note"
            value={values.note}
            onChange={set('note')}
            rows={2}
          />
        </div>
      </fieldset>
      <Message result={result} />
      {canEdit ? (
        <div>
          <Button type="submit" loading={busy} disabled={!values.name.trim()}>
            {partnerId ? 'Save owner' : 'Add owner'}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

/** Suspend or reactivate an owner. Suspension ends their portal access straight away; machines and money are untouched. */
export function OwnerStatusControl({
  partnerId,
  name,
  status,
}: {
  partnerId: string;
  name: string;
  status: 'active' | 'suspended';
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const next = status === 'active' ? 'suspended' : 'active';

  async function save() {
    setBusy(true);
    setResult(null);
    try {
      await send(`/api/vending/partners/${partnerId}`, 'PATCH', {
        status: next,
      });
      setConfirming(false);
      setResult({
        ok: true,
        text:
          next === 'suspended'
            ? `${name} is suspended.`
            : `${name} is active again.`,
      });
      router.refresh();
    } catch (error) {
      setResult({
        ok: false,
        text: error instanceof Error ? error.message : "Couldn't save.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {confirming ? (
        <div className="border-border flex flex-col gap-2 rounded-lg border p-3">
          <p className="text-foreground text-sm">
            {next === 'suspended'
              ? `${name} will be signed out of the owner portal and can't sign back in. Their machines keep selling and their balance stays as it is.`
              : `${name} will be able to sign in to the owner portal again.`}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={next === 'suspended' ? 'danger' : 'primary'}
              loading={busy}
              onClick={save}
            >
              {next === 'suspended' ? 'Suspend owner' : 'Reactivate owner'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirming(true)}
          >
            {status === 'active' ? 'Suspend…' : 'Reactivate…'}
          </Button>
        </div>
      )}
      <Message result={result} />
    </div>
  );
}

/** The sign-up link to send a new owner. There's no automatic email; staff send it themselves. */
export function PortalInvite({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  // The site address is only known in the browser; the server renders a relative link and the browser fills in the rest.
  const origin = useSyncExternalStore(
    () => () => undefined,
    () => window.location.origin,
    () => '',
  );
  const link = `${origin}/partner/login`;
  const message = `Your Snack Quest owner portal is ready. Go to ${link}, enter ${email} and choose a password — your account is set up the first time you sign in.`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm">
        Not signed up yet. Send them this:
      </p>
      <p className="bg-border/30 text-foreground rounded-lg px-3 py-2 text-sm">
        {message}
      </p>
      <div>
        <Button size="sm" variant="outline" onClick={copy}>
          <Copy className="size-4" aria-hidden="true" />
          {copied ? 'Copied' : 'Copy message'}
        </Button>
      </div>
    </div>
  );
}

/**
 * Record an agreement for one of the owner's machines. The owner's share
 * stays blank unless someone types it — a blank share means settlements
 * show no split, never a guessed one.
 */
export function NewAgreementForm({
  partnerId,
  machines,
}: {
  partnerId: string;
  machines: { id: string; code: string; hasActive: boolean }[];
}) {
  const router = useRouter();
  const [machineId, setMachineId] = useState('');
  const [pct, setPct] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [documentRef, setDocumentRef] = useState('');
  const [costNote, setCostNote] = useState('');
  const [note, setNote] = useState('');
  const [startNow, setStartNow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const chosen = machines.find((machine) => machine.id === machineId);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pct.trim() !== '' && !Number.isFinite(Number(pct))) {
      setResult({ ok: false, text: 'Owner’s share must be a number.' });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      await send(`/api/vending/partners/${partnerId}/agreements`, 'POST', {
        machineId,
        status: startNow ? 'active' : 'draft',
        revenueSharePartnerPct: pct.trim() === '' ? null : Number(pct),
        effectiveFrom: effectiveFrom
          ? new Date(`${effectiveFrom}T00:00:00+03:00`).toISOString()
          : null,
        documentRef: documentRef.trim() || null,
        operatingCostNote: costNote.trim() || null,
        note: note.trim() || null,
      });
      setResult({
        ok: true,
        text: startNow
          ? 'Agreement recorded and started.'
          : 'Draft agreement recorded.',
      });
      setMachineId('');
      setPct('');
      setEffectiveFrom('');
      setDocumentRef('');
      setCostNote('');
      setNote('');
      setStartNow(false);
      router.refresh();
    } catch (error) {
      setResult({
        ok: false,
        text: error instanceof Error ? error.message : "Couldn't save.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (machines.length === 0)
    return (
      <p className="text-muted-foreground text-sm">
        This owner has no machines yet. Give them a machine from its setup page
        first.
      </p>
    );

  const field =
    'h-10 rounded-lg border border-border bg-background px-3 text-sm';
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <fieldset
        disabled={busy}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="agr-machine">Machine</Label>
          <select
            id="agr-machine"
            value={machineId}
            onChange={(event) => setMachineId(event.target.value)}
            className={field}
            required
          >
            <option value="">Choose…</option>
            {machines.map((machine) => (
              <option key={machine.id} value={machine.id}>
                {machine.code}
                {machine.hasActive ? ' (has an active agreement)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="agr-pct">Owner’s share of net sales (%)</Label>
          <Input
            id="agr-pct"
            inputMode="decimal"
            value={pct}
            onChange={(event) => setPct(event.target.value)}
            placeholder="Leave blank until agreed"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="agr-from">Starts on</Label>
          <Input
            id="agr-from"
            type="date"
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="agr-doc">Signed document (link or reference)</Label>
          <Input
            id="agr-doc"
            value={documentRef}
            onChange={(event) => setDocumentRef(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="agr-cost">Who pays running costs</Label>
          <Textarea
            id="agr-cost"
            value={costNote}
            onChange={(event) => setCostNote(event.target.value)}
            rows={2}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="agr-note">Note</Label>
          <Textarea
            id="agr-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
          />
        </div>
        <label className="text-foreground flex items-start gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--color-primary)]"
            checked={startNow}
            onChange={(event) => setStartNow(event.target.checked)}
            disabled={chosen?.hasActive}
          />
          <span>
            Start it now
            <span className="text-muted-foreground block text-xs">
              {chosen?.hasActive
                ? 'End the machine’s current agreement first.'
                : 'Otherwise it’s saved as a draft you can start later. Settlements use the active agreement’s terms.'}
            </span>
          </span>
        </label>
      </fieldset>
      <Message result={result} />
      <div>
        <Button type="submit" loading={busy} disabled={!machineId}>
          Record agreement
        </Button>
      </div>
    </form>
  );
}

/** Start or end one agreement. Ending asks first: settlements after this point show no split until another starts. */
export function AgreementActions({
  partnerId,
  agreementId,
  status,
  canStart,
}: {
  partnerId: string;
  agreementId: string;
  status: string;
  canStart: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function change(to: 'active' | 'terminated') {
    setBusy(true);
    setResult(null);
    try {
      await send(
        `/api/vending/partners/${partnerId}/agreements/${agreementId}`,
        'PATCH',
        { status: to },
      );
      setConfirming(false);
      router.refresh();
    } catch (error) {
      setResult({
        ok: false,
        text: error instanceof Error ? error.message : "Couldn't save.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (status === 'terminated') return null;
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        {status === 'draft' && canStart ? (
          <Button size="sm" loading={busy} onClick={() => change('active')}>
            Start
          </Button>
        ) : null}
        {confirming ? (
          <>
            <Button
              size="sm"
              variant="danger"
              loading={busy}
              onClick={() => change('terminated')}
            >
              Yes, end it
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Keep
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            {status === 'draft' ? 'Discard' : 'End…'}
          </Button>
        )}
      </div>
      <Message result={result} />
    </div>
  );
}

/**
 * Hand a machine to another owner or back to Snack Quest. The new owner
 * sees nothing from before the handover, and any active agreement has to
 * end first so terms and ownership change together.
 */
export function MachineOwnerControl({
  machineId,
  currentOwnerId,
  owners,
  hasActiveAgreement,
}: {
  machineId: string;
  currentOwnerId: string | null;
  owners: { id: string; name: string; status: string }[];
  hasActiveAgreement: boolean;
}) {
  const router = useRouter();
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function save() {
    setBusy(true);
    setResult(null);
    try {
      await send(`/api/vending/machines/${machineId}/owner`, 'PATCH', {
        partnerId: target === '__snackquest__' ? null : target,
        reason: reason.trim() || null,
      });
      const name =
        target === '__snackquest__'
          ? 'Snack Quest'
          : owners.find((owner) => owner.id === target)?.name;
      setResult({ ok: true, text: `Now owned by ${name}.` });
      setTarget('');
      setReason('');
      router.refresh();
    } catch (error) {
      setResult({
        ok: false,
        text:
          error instanceof Error ? error.message : "Couldn't change the owner.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (hasActiveAgreement) {
    return (
      <p className="text-muted-foreground text-sm">
        To change the owner, first end the active agreement on the owner’s page and cancel any owner subscription.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="machine-owner">Give to</Label>
        <select
          id="machine-owner"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          disabled={busy}
          className="border-border bg-background h-10 max-w-sm rounded-lg border px-3 text-sm"
        >
          <option value="">Choose…</option>
          {currentOwnerId ? (
            <option value="__snackquest__">
              Snack Quest (no outside owner)
            </option>
          ) : null}
          {owners
            .filter(
              (owner) =>
                owner.id !== currentOwnerId && owner.status === 'active',
            )
            .map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="owner-reason">Why (kept in its history)</Label>
        <Input
          id="owner-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. Sold to new investor"
          className="max-w-sm"
        />
      </div>
      {target ? (
        <p className="text-muted-foreground max-w-md text-xs">
          From now on the new owner sees this machine’s sales in their portal;
          they won’t see anything from before. Settle the current owner’s time
          up to today separately.
        </p>
      ) : null}
      <div>
        <Button size="sm" onClick={save} loading={busy} disabled={!target}>
          Change owner
        </Button>
      </div>
      <Message result={result} />
    </div>
  );
}
