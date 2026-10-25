'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MpesaTillForm } from '@/components/partner/MpesaTillForm';
import type { PartnerPaymentAccountView } from '@/types';

const checked = new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** The owner's till: its state at a glance, with change and disconnect; the form straight away when there's none yet. */
export function MpesaTillPanel({ account, keysEncrypted }: { account: PartnerPaymentAccountView | null; keysEncrypted: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function disconnect() {
    setBusy(true);
    try {
      await fetch('/api/vending/partners/me/payment-account', { method: 'DELETE' });
      setConfirming(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!account) {
    return (
      <Card>
        <CardContent className="p-4 sm:p-6">
          <MpesaTillForm account={null} keysEncrypted={keysEncrypted} />
        </CardContent>
      </Card>
    );
  }

  const connected = account.status === 'connected';
  const name = `${account.accountType === 'till' ? 'Till' : 'Paybill'} ${account.shortcode}`;
  return (
    <div className="flex flex-col gap-4">
      <Card className={connected ? 'border-success/40' : 'border-danger/40'}>
        <CardContent className="flex flex-col gap-3 p-4 sm:p-6">
          <div className="flex items-start gap-3">
            {connected ? <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-6 shrink-0 text-danger" aria-hidden="true" />}
            <div className="min-w-0">
              <p className="text-lg font-semibold text-foreground">{connected ? `Connected: ${name}` : `Not working: ${name}`}</p>
              {connected ? (
                <p className="text-sm text-muted-foreground">Sales on your machines below are paid straight into it.</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-danger">{account.lastError ?? 'Safaricom didn’t accept these details'}</p>
                  {account.lastErrorDetail ? <p className="mt-1 text-sm text-foreground/80">{account.lastErrorDetail}</p> : null}
                  <p className="mt-1 text-sm text-muted-foreground">Until it’s fixed, sales go to Snack Quest and reach you at settlement.</p>
                </>
              )}
              <p className="mt-1 text-xs text-muted-foreground">Last checked {checked.format(account.lastCheckedAtMs)}</p>
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
              <p className="text-sm text-foreground">Disconnect {name}? Sales go back to Snack Quest’s paybill, and your keys are deleted.</p>
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
            <MpesaTillForm account={account} keysEncrypted={keysEncrypted} onDone={() => setEditing(false)} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
