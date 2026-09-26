'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Camera as CameraIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const CAMERA_TYPES = [
  { value: 'mock', label: 'Mock (development/simulator)' },
  { value: 'usb', label: 'USB' },
  { value: 'ip', label: 'IP (HTTP snapshot)' },
  { value: 'rtsp', label: 'RTSP' },
  { value: 'onvif', label: 'ONVIF' },
  { value: 'manufacturer_specific', label: 'Manufacturer-specific' },
] as const;

/**
 * §1/§10 CAMERA CONFIGURATION — add a camera and, in the same
 * submission, save whatever connection details were entered. Lands
 * on `not_configured` if no connection fields were filled in, or
 * `configured` once they are — never `active`: activation is its
 * own separate, explicit action (`CameraActions`), only enabled once
 * a test has actually passed.
 */
export function AddCameraForm({ machineId }: { machineId: string }) {
  const router = useRouter();
  const [type, setType] = useState<string>('mock');
  const [label, setLabel] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [streamPath, setStreamPath] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!label.trim()) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const registerResponse = await fetch(`/api/vending/machines/${machineId}/cameras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, label: label.trim(), manufacturer: manufacturer.trim() || null, model: model.trim() || null }),
      });
      const registerData = (await registerResponse.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!registerResponse.ok || !registerData?.id) {
        throw new Error(registerData?.error ?? `Could not add the camera (HTTP ${registerResponse.status}).`);
      }

      const hasConnectionDetails = host.trim() || port.trim() || streamPath.trim() || username.trim() || password.trim();
      if (hasConnectionDetails) {
        const configureResponse = await fetch(`/api/vending/cameras/${registerData.id}/configure`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            host: host.trim() || null,
            port: port.trim() ? Number(port) : null,
            streamPath: streamPath.trim() || null,
            username: username.trim() || null,
            password: password.trim() || null,
          }),
        });
        if (!configureResponse.ok) {
          const configureData = (await configureResponse.json().catch(() => null)) as { error?: string } | null;
          throw new Error(configureData?.error ?? `Camera was added, but saving its connection failed (HTTP ${configureResponse.status}).`);
        }
      }

      setLabel('');
      setManufacturer('');
      setModel('');
      setHost('');
      setPort('');
      setStreamPath('');
      setUsername('');
      setPassword('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the camera.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <p className="text-sm font-medium text-foreground">Add camera</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="camera-type">Type</Label>
          <select id="camera-type" value={type} onChange={(event) => setType(event.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
            {CAMERA_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="camera-label">Label</Label>
          <Input id="camera-label" placeholder="e.g. Dispense area" value={label} onChange={(event) => setLabel(event.target.value)} className="h-9" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="camera-manufacturer">Manufacturer</Label>
          <Input id="camera-manufacturer" placeholder="Optional" value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} className="h-9" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="camera-model">Model</Label>
          <Input id="camera-model" placeholder="Optional" value={model} onChange={(event) => setModel(event.target.value)} className="h-9" />
        </div>
      </div>

      <p className="text-caption text-muted-foreground">Connection (optional here — can be added later before activating):</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Input placeholder="Host" value={host} onChange={(event) => setHost(event.target.value)} className="h-9" aria-label="Host" />
        <Input placeholder="Port" type="number" inputMode="numeric" value={port} onChange={(event) => setPort(event.target.value)} className="h-9" aria-label="Port" />
        <Input placeholder="Stream path" value={streamPath} onChange={(event) => setStreamPath(event.target.value)} className="h-9" aria-label="Stream path" />
        <Input placeholder="Username" value={username} onChange={(event) => setUsername(event.target.value)} className="h-9" aria-label="Username" />
        <Input placeholder="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-9" aria-label="Password" />
      </div>

      <div>
        <Button type="submit" loading={busy} size="sm" variant="outline" disabled={!label.trim()}>
          <CameraIcon className="size-4" aria-hidden="true" />
          Add camera
        </Button>
      </div>
      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </form>
  );
}
