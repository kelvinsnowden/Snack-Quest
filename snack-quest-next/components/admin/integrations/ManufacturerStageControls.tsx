'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MANUFACTURER_ONBOARDING_STAGES, type ManufacturerOnboardingStage, type ManufacturerStatus } from '@/types';
import { STAGE_LABELS } from './IntegrationBadges';
import { sendJson } from './sendJson';

/**
 * Manufacturer → Application → Technical review → Credentials → Test
 * environment → Certification → Production, as a stepper. Forward one
 * stage at a time; any earlier stage can be returned to. The server
 * enforces the same rules (and the certified-model gate on Production).
 */
export function ManufacturerStageControls({ manufacturerId, stage, status }: { manufacturerId: string; stage: ManufacturerOnboardingStage; status: ManufacturerStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentIndex = MANUFACTURER_ONBOARDING_STAGES.indexOf(stage);
  const next = MANUFACTURER_ONBOARDING_STAGES[currentIndex + 1];

  async function run(label: string, url: string, body: unknown) {
    setBusy(label);
    setError(null);
    try {
      await sendJson(url, 'POST', body);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That change was refused.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-wrap gap-2" aria-label="Onboarding stages">
        {MANUFACTURER_ONBOARDING_STAGES.map((candidate, index) => {
          const done = index < currentIndex;
          const current = index === currentIndex;
          return (
            <li key={candidate}>
              <button
                type="button"
                disabled={busy !== null || index >= currentIndex}
                onClick={() => run('back', `/api/vending/integrations/manufacturers/${manufacturerId}/stage`, { stage: candidate })}
                title={index < currentIndex ? `Move back to ${STAGE_LABELS[candidate]}` : undefined}
                aria-current={current ? 'step' : undefined}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  current ? 'border-primary bg-primary/10 text-primary' : done ? 'border-success/40 text-success hover:bg-success/10' : 'border-border text-muted-foreground'
                }`}
              >
                {done ? <Check className="size-3" aria-hidden="true" /> : <span className="tabular-nums">{index + 1}</span>}
                {STAGE_LABELS[candidate]}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        {next ? (
          <Button size="sm" loading={busy === 'advance'} disabled={busy !== null || status === 'suspended'} onClick={() => run('advance', `/api/vending/integrations/manufacturers/${manufacturerId}/stage`, { stage: next })}>
            Advance to {STAGE_LABELS[next]}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          loading={busy === 'status'}
          disabled={busy !== null}
          onClick={() => {
            if (status === 'active' && !window.confirm('Suspending stops dispensing on every machine from this manufacturer. Continue?')) return;
            void run('status', `/api/vending/integrations/manufacturers/${manufacturerId}/status`, { status: status === 'active' ? 'suspended' : 'active' });
          }}
        >
          {status === 'active' ? 'Suspend manufacturer' : 'Reactivate manufacturer'}
        </Button>
      </div>
      <p className="text-caption text-muted-foreground">Select an earlier completed stage to move back to it (for example after a failed certification).</p>
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
    </div>
  );
}
