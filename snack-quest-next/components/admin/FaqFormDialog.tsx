'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export interface FaqFormValues {
  question: string;
  answer: string;
}

const DEFAULTS: FaqFormValues = { question: '', answer: '' };

/**
 * Create or edit a FAQ entry (§ Admin: FAQ) — one dialog, reused for
 * both modes like `SupplierFormDialog`. Shown on both the homepage's
 * FAQ section and `/faq` the moment it's saved active.
 */
export function FaqFormDialog({
  mode,
  faqId,
  initialValues,
  trigger,
}: {
  mode: 'create' | 'edit';
  faqId?: string;
  initialValues?: FaqFormValues;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FaqFormValues>(initialValues ?? DEFAULTS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setValues(initialValues ?? DEFAULTS);
    setError(null);
  }

  async function onSubmit() {
    if (!values.question.trim() || !values.answer.trim()) {
      setError('Question and answer are both required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = { question: values.question.trim(), answer: values.answer.trim() };
      const response = await fetch(mode === 'create' ? '/api/admin/faqs' : `/api/admin/faqs/${faqId}`, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not save this FAQ.');
      }
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this FAQ.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus className="size-4" aria-hidden="true" />
            Add FAQ
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add FAQ' : 'Edit FAQ'}</DialogTitle>
          <DialogDescription>
            Shown on the homepage&apos;s FAQ section and the /faq page as soon as it&apos;s saved.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="faq-question">Question</Label>
            <Input
              id="faq-question"
              value={values.question}
              onChange={(event) => setValues((v) => ({ ...v, question: event.target.value }))}
              placeholder="e.g. How do I pay?"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="faq-answer">Answer</Label>
            <Textarea
              id="faq-answer"
              value={values.answer}
              onChange={(event) => setValues((v) => ({ ...v, answer: event.target.value }))}
              placeholder="What customers should know"
              rows={4}
            />
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={submitting}>
            {mode === 'create' ? 'Add FAQ' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
