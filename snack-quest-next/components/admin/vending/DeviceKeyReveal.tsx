'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import qrcode from 'qrcode-generator';
import { AlertTriangle, Copy, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pairingLink } from '@/lib/vending/kioskPairing';

function QrCode({ value, label }: { value: string; label: string }) {
  // Drawn here in the browser: the key is never sent to a QR service.
  const { path, size } = useMemo(() => {
    const code = qrcode(0, 'M');
    code.addData(value);
    code.make();
    const count = code.getModuleCount();
    let d = '';
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (code.isDark(row, col)) d += `M${col + 4} ${row + 4}h1v1h-1z`;
      }
    }
    return { path: d, size: count + 8 };
  }, [value]);
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${size} ${size}`} className="size-56 rounded-lg bg-white" shapeRendering="crispEdges">
      <path d={path} fill="#000" />
    </svg>
  );
}

/**
 * A screen key, shown once. Snack Quest keeps only a hash, so once this
 * panel closes the key can't be shown again — only replaced. Offers the
 * key to copy, and a QR code the machine's screen can scan to pair
 * itself without anyone typing the key.
 */
export function DeviceKeyReveal({ machineCode, secret, onDone }: { machineCode: string; secret: string; onDone: () => void }) {
  const origin = useSyncExternalStore(
    () => () => undefined,
    () => window.location.origin,
    () => '',
  );
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setShown(true);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-warning/40 bg-warning/10 p-4">
      <p className="flex items-start gap-2 text-sm font-medium text-foreground">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        This is the only time this key is shown. Pair the screen now, or keep the key somewhere safe.
      </p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {origin ? <QrCode value={pairingLink(origin, machineCode, secret)} label={`Pairing code for ${machineCode}`} /> : <div className="size-56 rounded-lg bg-border/40" aria-hidden="true" />}
        <div className="flex min-w-0 flex-1 flex-col gap-3 text-sm">
          <p className="text-foreground">
            <span className="font-medium">To pair the screen:</span> on {machineCode}’s screen, open the camera and point it at this code, then open the link. The screen saves the key and starts up.
            <br />
            <span className="text-muted-foreground">No camera on the screen? Open <code className="font-mono">{origin ? `${origin.replace(/^https?:\/\//, '')}/machine/${machineCode}` : `/machine/${machineCode}`}</code> in its browser and type the key where it asks for the device secret.</span>
          </p>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Key</span>
            <code className="break-all rounded-md bg-background px-2 py-1.5 font-mono text-xs text-foreground">{shown ? secret : `${secret.slice(0, 8)}${'•'.repeat(24)}`}</code>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setShown((value) => !value)}>
                {shown ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                {shown ? 'Hide' : 'Show'}
              </Button>
              <Button size="sm" variant="outline" onClick={copy}>
                <Copy className="size-4" aria-hidden="true" />
                {copied ? 'Copied' : 'Copy key'}
              </Button>
            </div>
          </div>
        </div>
      </div>
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-primary)]" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        The screen is paired, or the key is stored safely.
      </label>
      <div>
        <Button size="sm" disabled={!confirmed} onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}
