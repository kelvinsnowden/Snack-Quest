'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MpesaTillForm } from '@/components/partner/MpesaTillForm';
import { tillLabel } from '@/lib/vending/tillLabel';
import type { PartnerPaymentAccountView } from '@/types';

const checked = new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** One till: its state at a glance, which machines use it, with change and disconnect. */
function TillCard({ till, machineCodes, keysEncrypted }: { till: PartnerPaymentAccountView; machineCodes: Map<string, string>; keysEncrypted: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const connected = till.status === 'connected';
  const name = tillLabel(till);
  const machines = till.machineIds.map((id) => machineCodes.get(id)).filter(Boolean);

  async function disconnect() {
    setBusy(true);
    try {
      await fetch(`/api/vending/partners/me/payment-accounts/${till.id}`, { method: 'DELETE' });
      setConfirming(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className={connected ? 'border-success/40' : 'border-danger/40'}>
        <CardContent className="flex flex-col gap-3 p-4 sm:p-6">
          <div className="flex items-start gap-3">
            {connected ? <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-6 shrink-0 text-danger" aria-hidden="true" />}
            <div className="min-w-0">
              <p className="text-lg font-semibold text-foreground">{connected ? `Connected: ${name}` : `Not working: ${name}`}</p>
              {connected ? null : (
                <>
                  <p className="text-sm font-medium text-danger">{till.lastError ?? 'Safaricom didn’t accept these details'}</p>
                  {till.lastErrorDetail ? <p className="mt-1 text-sm text-foreground/80">{till.lastErrorDetail}</p> : null}
                  <p className="mt-1 text-sm text-muted-foreground">Until it’s fixed, its machines’ sales go to Snack Quest and reach you at settlement.</p>
                </>
              )}
              <p className="mt-1 text-sm text-muted-foreground">{machines.length === 0 ? 'No machines use it yet. Choose it for a machine below.' : `Used by ${machines.join(', ')}`}</p>
              <p className="mt-1 text-xs text-muted-foreground">Last checked {checked.format(till.lastCheckedAtMs)}</p>
            </div>
          </div>
          {!editing && !confirming ? (
            <div className="flex flex-wrap gap-2">
              <Button variant={connected ? 'outline' : 'primary'} onClick={() => setEditing(true)}>
                {connected ? 'Change details' : 'Fix details'}
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(true)}>
                Disconnect
              </Button>
            </div>
          ) : null}
          {confirming ? (
            <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
              <p className="text-sm text-foreground">Disconnect {name}? Its machines’ sales go back to Snack Quest’s paybill, and its keys are deleted.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" loading={busy} onClick={disconnect}>
                  Disconnect
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>
                  Keep it
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
      {editing ? (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <MpesaTillForm account={till} keysEncrypted={keysEncrypted} onDone={() => setEditing(false)} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * The owner's tills: one card each, and "Add another till". With none yet,
 * the form straight away.
 */
export function MpesaTillPanel({ tills, machines, keysEncrypted }: { tills: PartnerPaymentAccountView[]; machines: { id: string; code: string }[]; keysEncrypted: boolean }) {
  const [adding, setAdding] = useState(false);
  const machineCodes = new Map(machines.map(({ id, code }) => [id, code]));
  const shareFrom = tills.filter((till) => till.status === 'connected').map((till) => ({ id: till.id, label: tillLabel(till) }));

  if (tills.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 sm:p-6">
          <MpesaTillForm account={null} keysEncrypted={keysEncrypted} />
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {tills.map((till) => (
        <TillCard key={till.id} till={till} machineCodes={machineCodes} keysEncrypted={keysEncrypted} />
      ))}
      {adding ? (
        <Card>
          <CardContent className="flex flex-col gap-4 p-4 sm:p-6">
            <p className="text-lg font-semibold text-foreground">Add another till</p>
            <MpesaTillForm account={null} keysEncrypted={keysEncrypted} shareFrom={shareFrom} onDone={() => setAdding(false)} />
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" className="self-start" onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" />
          Add another till
        </Button>
      )}
    </div>
  );
}
