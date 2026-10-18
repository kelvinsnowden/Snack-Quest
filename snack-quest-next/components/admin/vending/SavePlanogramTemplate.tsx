'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Saves this machine's slot layout as a planogram template others can be set up from. */
export function SavePlanogramTemplate({ machineId }: { machineId: string }) {
  const [name, setName] = useState('');
  const [suitsFor, setSuitsFor] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/vending/machines/${machineId}/planogram-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, suitsFor }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? `That didn’t save (HTTP ${response.status}).`);
      setMessage({ tone: 'ok', text: `Saved as “${name.trim()}”.` });
      setName('');
      setSuitsFor('');
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'That didn’t save.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="planogram-name">Template name</Label>
          <Input id="planogram-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="e.g. Office – drinks and bars" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="planogram-suits">Suits (optional)</Label>
          <Input id="planogram-suits" value={suitsFor} maxLength={60} onChange={(event) => setSuitsFor(event.target.value)} placeholder="e.g. Offices" />
        </div>
      </div>
      {message ? (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-sm text-danger' : 'text-sm text-success'}>
          {message.text}{' '}
          {message.tone === 'ok' ? (
            <Link href="/admin/vending/planograms" className="font-medium underline">
              See templates
            </Link>
          ) : null}
        </p>
      ) : null}
      <div>
        <Button type="button" variant="outline" onClick={save} loading={busy} disabled={!name.trim()}>
          Save layout as template
        </Button>
      </div>
    </div>
  );
}
