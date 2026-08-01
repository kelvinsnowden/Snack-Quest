'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { INTEGRATION_PROVIDER_LABELS } from '@/lib/integrations/statusFormat';
import type { IntegrationSummary } from '@/services/integrationSettingsService';

/**
 * Edit form for one integration's credentials (§ Integration Portal).
 * Every field starts blank, not pre-filled with the masked placeholder
 * text — leaving a field blank on submit means "leave this credential
 * unchanged" (`IntegrationSettingsService.updateSecret`'s merge
 * semantics), so there's never a risk of accidentally saving the
 * literal masked string `••••1234` over a real secret.
 */
export function IntegrationEditDialog({
  integration,
  open,
  onOpenChange,
}: {
  integration: IntegrationSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setValues({});
    setError(null);
  }

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const patch: Record<string, string> = {};
      for (const [key, value] of Object.entries(values)) {
        if (value.trim().length > 0) {
          patch[key] = value.trim();
        }
      }
      if (Object.keys(patch).length === 0) {
        setError('Change at least one field before saving.');
        setSubmitting(false);
        return;
      }
      const response = await fetch(`/api/admin/integrations/${integration.provider}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not save these credentials.');
      }
      onOpenChange(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save these credentials.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{INTEGRATION_PROVIDER_LABELS[integration.provider] ?? integration.provider}</DialogTitle>
          <DialogDescription>
            Leave a field blank to keep its current value. Changes take effect immediately — no redeploy needed.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col gap-4">
          {integration.fields.map((field) => (
            <div key={field.key} className="flex flex-col gap-1.5">
              <Label htmlFor={`integration-${integration.provider}-${field.key}`}>
                {field.label}
                {field.required ? <span className="text-danger"> *</span> : null}
              </Label>
              {field.type === 'select' && field.options ? (
                <select
                  id={`integration-${integration.provider}-${field.key}`}
                  className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-foreground"
                  value={values[field.key] ?? ''}
                  onChange={(event) => setValues((v) => ({ ...v, [field.key]: event.target.value }))}
                >
                  <option value="">{field.value ? `Keep current (${field.value})` : 'Select…'}</option>
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={`integration-${integration.provider}-${field.key}`}
                  type={field.secret ? 'password' : 'text'}
                  value={values[field.key] ?? ''}
                  onChange={(event) => setValues((v) => ({ ...v, [field.key]: event.target.value }))}
                  placeholder={field.value ? `Currently set (${field.value})` : 'Not set'}
                  autoComplete="off"
                />
              )}
              {field.helpText ? <p className="text-caption text-muted-foreground">{field.helpText}</p> : null}
            </div>
          ))}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={submitting}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
