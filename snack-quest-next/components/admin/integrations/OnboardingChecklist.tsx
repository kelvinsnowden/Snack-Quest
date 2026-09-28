import { CheckCircle2, Circle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { OnboardingStep } from '@/services/manufacturerOnboardingService';

const OWNER_LABEL: Record<OnboardingStep['owner'], string> = { staff: 'Snack Quest staff', manufacturer: 'Manufacturer', system: 'Automatic' };

/** Where this manufacturer is in onboarding, from recorded facts only — and whose move each open step is. */
export function OnboardingChecklist({ steps }: { steps: OnboardingStep[] }) {
  const applicable = steps.filter((step) => step.applicable);
  const done = applicable.filter((step) => step.done).length;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{done} of {applicable.length} steps complete. Steps are derived from what has actually happened; none can be ticked by hand here.</p>
      <ol className="flex flex-col divide-y divide-border">
        {applicable.map((step) => (
          <li key={step.key} className="flex items-start gap-3 py-2 text-sm">
            {step.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Done" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Open" />}
            <div className="flex flex-1 flex-col gap-0.5">
              <span className={step.done ? 'text-foreground' : 'font-medium text-foreground'}>{step.label}</span>
              <span className="text-caption text-muted-foreground">{step.detail}</span>
            </div>
            <Badge variant={step.owner === 'system' ? 'outline' : 'secondary'}>{OWNER_LABEL[step.owner]}</Badge>
          </li>
        ))}
      </ol>
    </div>
  );
}
