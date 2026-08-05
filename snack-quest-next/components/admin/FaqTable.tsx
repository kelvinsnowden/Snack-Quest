'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Trash2, HelpCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FaqFormDialog } from './FaqFormDialog';

export interface FaqListItem {
  id: string;
  question: string;
  answer: string;
  isActive: boolean;
}

/**
 * Admin: FAQ list (§ Admin: FAQ) — same interactive-table shape as
 * `StaffTable`: inline toggle, a `confirm()`-gated delete, and the
 * edit dialog opened per row.
 */
export function FaqTable({ faqs }: { faqs: FaqListItem[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleActive(faq: FaqListItem) {
    setBusyId(faq.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/faqs/${faq.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isActive: !faq.isActive }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? 'Could not update this FAQ.');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this FAQ.');
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(faq: FaqListItem) {
    if (!confirm(`Delete "${faq.question}"? This removes it from the homepage and /faq immediately.`)) {
      return;
    }
    setBusyId(faq.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/faqs/${faq.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? 'Could not delete this FAQ.');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this FAQ.');
    } finally {
      setBusyId(null);
    }
  }

  if (faqs.length === 0) {
    return (
      <EmptyState
        icon={HelpCircle}
        title="No FAQs yet"
        description="Add the questions customers ask most before their first order."
        action={<FaqFormDialog mode="create" />}
      />
    );
  }

  return (
    <>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Question</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {faqs.map((faq) => {
                const busy = busyId === faq.id;
                return (
                  <tr key={faq.id} className="border-b border-border last:border-0 hover:bg-border/20">
                    <td className="max-w-md px-4 py-3">
                      <p className="font-medium text-foreground">{faq.question}</p>
                      <p className="line-clamp-1 text-caption text-muted-foreground">{faq.answer}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={faq.isActive ? 'success' : 'outline'}>{faq.isActive ? 'Active' : 'Hidden'}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <FaqFormDialog
                          mode="edit"
                          faqId={faq.id}
                          initialValues={{ question: faq.question, answer: faq.answer }}
                          trigger={
                            <Button variant="outline" size="sm">
                              Edit
                            </Button>
                          }
                        />
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => toggleActive(faq)}>
                          {faq.isActive ? (
                            <EyeOff className="size-4" aria-hidden="true" />
                          ) : (
                            <Eye className="size-4" aria-hidden="true" />
                          )}
                        </Button>
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => onDelete(faq)}>
                          <Trash2 className="size-4 text-danger" aria-hidden="true" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
