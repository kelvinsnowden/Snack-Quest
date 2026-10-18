'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TemplateRow {
  id: string;
  name: string;
  suitsFor: string | null;
  sourceMachineCode: string | null;
  createdAt: string | null;
  slots: { slotCode: string; product: string; priceKes: number; capacity: number }[];
}

const day = new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric' });

export function PlanogramTemplateList({ templates, canManage }: { templates: TemplateRow[]; canManage: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(template: TemplateRow) {
    if (!window.confirm(`Delete “${template.name}”? Machines already set up from it keep their slots.`)) return;
    setError(null);
    const response = await fetch(`/api/vending/planograms/${template.id}`, { method: 'DELETE' });
    if (!response.ok) setError('That template couldn’t be deleted.');
    router.refresh();
  }

  if (templates.length === 0) return <p className="text-sm text-muted-foreground">No templates yet. Open a machine&rsquo;s Slots page and save its layout as one.</p>;

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <ul className="flex flex-col divide-y divide-border">
        {templates.map((template) => (
          <li key={template.id} className="flex flex-col gap-2 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-foreground">{template.name}</p>
                <p className="text-sm text-muted-foreground">
                  {template.slots.length} slots{template.suitsFor ? ` · suits ${template.suitsFor}` : ''}
                  {template.sourceMachineCode ? ` · from ${template.sourceMachineCode}` : ''}
                  {template.createdAt ? ` · ${day.format(new Date(template.createdAt))}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(open === template.id ? null : template.id)} aria-expanded={open === template.id}>
                  {open === template.id ? 'Hide slots' : 'Show slots'}
                </Button>
                {canManage ? (
                  <>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/vending/bulk?planogram=${template.id}`}>Apply to machines</Link>
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => remove(template)} aria-label={`Delete ${template.name}`}>
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
            {open === template.id ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-1.5 pr-4 font-medium">Slot</th>
                    <th className="py-1.5 pr-4 font-medium">Product</th>
                    <th className="py-1.5 pr-4 font-medium">Price</th>
                    <th className="py-1.5 font-medium">Capacity</th>
                  </tr>
                </thead>
                <tbody>
                  {template.slots.map((slot) => (
                    <tr key={slot.slotCode} className="border-b border-border last:border-0">
                      <td className="py-1.5 pr-4 font-medium text-foreground">{slot.slotCode}</td>
                      <td className="py-1.5 pr-4 text-muted-foreground">{slot.product}</td>
                      <td className="py-1.5 pr-4 tabular-nums text-muted-foreground">KES {slot.priceKes}</td>
                      <td className="py-1.5 tabular-nums text-muted-foreground">{slot.capacity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
