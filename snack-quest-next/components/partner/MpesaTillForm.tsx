'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { PartnerPaymentAccountType, PartnerPaymentAccountView } from '@/types';

type Outcome = { ok: true } | { ok: false; title: string; detail: string | null } | null;

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm text-primary" aria-hidden="true">
          {number}
        </span>
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

/**
 * Connect the owner's own till or paybill in three steps: the number,
 * the three Daraja keys, then a check with Safaricom that charges
 * nobody. Saved keys are never shown again; leaving a key blank keeps
 * the saved one. A new till can reuse the keys of one already connected
 * (several tills under one store share one Daraja app).
 */
export function MpesaTillForm({
  account,
  keysEncrypted,
  shareFrom = [],
  onDone,
}: {
  account: PartnerPaymentAccountView | null;
  keysEncrypted: boolean;
  /** Connected tills whose keys a new till may reuse. */
  shareFrom?: { id: string; label: string }[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const [sameKeysAs, setSameKeysAs] = useState<string>('');
  const [accountType, setAccountType] = useState<PartnerPaymentAccountType>(account?.accountType ?? 'till');
  const [shortcode, setShortcode] = useState(account?.shortcode ?? '');
  const [headOffice, setHeadOffice] = useState(account?.headOfficeShortcode ?? '');
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');
  const [passkey, setPasskey] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const keepHint = account ? 'Saved. Leave blank to keep it.' : undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setOutcome(null);
    try {
      const response = await fetch(account ? `/api/vending/partners/me/payment-accounts/${account.id}` : '/api/vending/partners/me/payment-accounts', {
        method: account ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountType, shortcode, headOfficeShortcode: accountType === 'till' ? headOffice : '', consumerKey, consumerSecret, passkey, sameKeysAs: sameKeysAs || null }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; problem?: { title: string; detail: string } | null };
      if (!response.ok) {
        setOutcome({ ok: false, title: data.error ?? 'Couldn’t save. Try again.', detail: null });
        return;
      }
      setConsumerKey('');
      setConsumerSecret('');
      setPasskey('');
      setOutcome(data.problem ? { ok: false, title: data.problem.title, detail: data.problem.detail } : { ok: true });
      router.refresh();
      if (!data.problem) onDone?.();
    } catch {
      setOutcome({ ok: false, title: 'Couldn’t reach Snack Quest. Check your connection and try again.', detail: null });
    } finally {
      setBusy(false);
    }
  }

  const numberLabel = accountType === 'till' ? 'Till number' : 'Paybill number';
  return (
    <form onSubmit={submit} className="flex flex-col gap-8">
      <Step number={1} title="Your till or paybill">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Account type">
          {(['till', 'paybill'] as const).map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={accountType === type}
              onClick={() => setAccountType(type)}
              className={cn(
                'min-h-12 rounded-xl border px-3 text-sm font-medium transition-colors',
                accountType === type ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {type === 'till' ? 'Till (Buy Goods)' : 'Paybill'}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="mpesa-shortcode">{numberLabel}</Label>
          <Input id="mpesa-shortcode" inputMode="numeric" autoComplete="off" placeholder={accountType === 'till' ? 'e.g. 5123456' : 'e.g. 247247'} value={shortcode} onChange={(event) => setShortcode(event.target.value)} disabled={busy} required />
        </div>
        {accountType === 'till' ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="mpesa-store">Store number (optional)</Label>
            <Input id="mpesa-store" inputMode="numeric" autoComplete="off" placeholder="Same as the till" value={headOffice} onChange={(event) => setHeadOffice(event.target.value)} disabled={busy} />
            <p className="text-xs text-muted-foreground">Only if Safaricom gave your till a separate store or head-office number. It’s the number your Daraja app is registered with.</p>
          </div>
        ) : null}
      </Step>

      <Step number={2} title="Your keys from Safaricom">
        {!account && shareFrom.length > 0 ? (
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Which keys">
            {[{ id: '', label: 'New keys for this till' }, ...shareFrom.map((till) => ({ id: till.id, label: `Same keys as ${till.label}` }))].map((option) => (
              <button
                key={option.id || 'new'}
                type="button"
                role="radio"
                aria-checked={sameKeysAs === option.id}
                onClick={() => setSameKeysAs(option.id)}
                className={cn(
                  'min-h-12 rounded-xl border px-3 text-left text-sm font-medium transition-colors',
                  sameKeysAs === option.id ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
            <p className="text-xs text-muted-foreground">Tills under the same store usually share one Daraja app, so they share its keys.</p>
          </div>
        ) : null}
        {sameKeysAs ? null : (
          <>
            <div className="rounded-xl border border-border bg-background/40 p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Where to find them</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5">
                <li>Sign in at developer.safaricom.co.ke and open your app under <span className="text-foreground">My Apps</span>.</li>
                <li>Take it live (<span className="text-foreground">Go Live</span>) for this {accountType === 'till' ? 'till' : 'paybill'} with M-Pesa Express.</li>
                <li>Copy the live app’s <span className="text-foreground">consumer key</span> and <span className="text-foreground">consumer secret</span>. Safaricom emails you the <span className="text-foreground">passkey</span>.</li>
              </ol>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="mpesa-key">Consumer key</Label>
              <Input id="mpesa-key" autoComplete="off" spellCheck={false} placeholder={account ? `Saved, ends in ${account.consumerKeyEnding}` : undefined} value={consumerKey} onChange={(event) => setConsumerKey(event.target.value)} disabled={busy} required={!account && !sameKeysAs} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="mpesa-secret">Consumer secret</Label>
              <Input id="mpesa-secret" type="password" autoComplete="off" placeholder={keepHint} value={consumerSecret} onChange={(event) => setConsumerSecret(event.target.value)} disabled={busy} required={!account && !sameKeysAs} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="mpesa-passkey">Passkey</Label>
              <Input id="mpesa-passkey" type="password" autoComplete="off" placeholder={keepHint} value={passkey} onChange={(event) => setPasskey(event.target.value)} disabled={busy} required={!account && !sameKeysAs} />
            </div>
          </>
        )}
      </Step>

      <Step number={3} title="Check and connect">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          We check these with Safaricom before any sale uses them. Nobody is charged. {keysEncrypted ? 'Your keys are stored encrypted' : 'Your keys are kept on Snack Quest’s server only'}, and never shown again.
        </p>
        {outcome && !outcome.ok ? (
          <div role="alert" className="flex items-start gap-2 rounded-xl bg-danger/10 p-3 text-sm text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-medium">{outcome.title}</span>
              {outcome.detail ? <span className="mt-1 block text-foreground/80">{outcome.detail}</span> : null}
            </span>
          </div>
        ) : null}
        {outcome?.ok ? (
          <p role="status" className="flex items-center gap-2 text-sm font-medium text-success">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            Connected. Safaricom accepted your details.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={busy} className="w-full sm:w-auto">
            Check and connect
          </Button>
          {account && onDone ? (
            <Button type="button" variant="outline" disabled={busy} onClick={onDone}>
              Cancel
            </Button>
          ) : null}
        </div>
      </Step>
    </form>
  );
}
