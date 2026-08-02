'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import type { FeatureFlagView } from '@/services/featureFlagService';

export function FeatureFlagList({ flags }: { flags: FeatureFlagView[] }) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: string, enabled: boolean) {
    setBusyKey(key);
    setError(null);
    try {
      const response = await fetch('/api/admin/feature-flags', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key, enabled }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not update this flag.');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this flag.');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {flags.map((flag) => (
        <Card key={flag.key}>
          <CardContent className="flex items-center justify-between gap-4 pt-6">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">{flag.name}</p>
                {!flag.isOverridden ? <Badge variant="outline">Default</Badge> : null}
              </div>
              <p className="mt-1 text-caption text-muted-foreground">{flag.description}</p>
              {flag.isOverridden && flag.updatedAt ? (
                <p className="mt-1 text-caption text-muted-foreground">Changed {new Date(flag.updatedAt).toLocaleString()}</p>
              ) : null}
            </div>
            <Switch
              checked={flag.enabled}
              disabled={busyKey === flag.key}
              onCheckedChange={(checked) => toggle(flag.key, checked)}
              aria-label={`Toggle ${flag.name}`}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
