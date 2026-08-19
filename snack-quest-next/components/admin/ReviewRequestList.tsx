'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * The "customers worth asking for a review" queue (§ Mission 2 —
 * review acquisition).
 *
 * A worklist, not an automation. Nothing here messages anyone: it
 * shows who has had their box long enough to have an opinion and
 * hasn't been asked, opens a pre-written message in whatever the staff
 * member already uses, and records that the ask happened so the same
 * customer isn't chased twice. The sending stays human on purpose —
 * the messaging integrations are out of scope, and a queue a person
 * works is useful today without them.
 */

export interface ReviewRequestRow {
  orderId: string;
  orderNumber: number | null;
  customerName: string;
  phoneNumber: string;
  packageLabel: string;
  placedAtIso: string;
}

export function ReviewRequestList({
  rows,
  reviewUrl,
}: {
  rows: ReviewRequestRow[];
  reviewUrl: string;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Marked rows disappear on the next refresh; until then they read as
  // done rather than vanishing under the cursor mid-list.
  const [markedIds, setMarkedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  async function markAsked(orderId: string) {
    setPendingId(orderId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/reviews/requests/${orderId}`, { method: 'POST' });
      if (!response.ok) {
        throw new Error();
      }
      setMarkedIds((current) => new Set(current).add(orderId));
      router.refresh();
    } catch {
      setError('That didn’t save. Please try again.');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}

      <ul className="border-border divide-border divide-y rounded-lg border">
        {rows.map((row) => {
          const marked = markedIds.has(row.orderId);
          const message = `Hi ${row.customerName.split(' ')[0]}! Hope you enjoyed your Snack Quest box 🎁 Would you mind leaving a quick review? ${reviewUrl}`;
          return (
            <li
              key={row.orderId}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-foreground truncate text-sm font-semibold">
                  {row.customerName}
                  {row.orderNumber !== null ? (
                    <span className="text-muted-foreground font-normal"> · #{row.orderNumber}</span>
                  ) : null}
                </p>
                <p className="text-muted-foreground mt-0.5 truncate text-sm">
                  {row.packageLabel} ·{' '}
                  <span className="tabular-nums">{row.phoneNumber}</span>
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Ordered{' '}
                  {new Date(row.placedAtIso).toLocaleDateString('en-KE', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {/*
                  A plain wa.me hyperlink that opens the staff member's
                  own WhatsApp with the message pre-typed — the same
                  mechanism this page already uses for its generic
                  review link. It is not the WhatsApp integration and
                  sends nothing on its own; a human still presses send.
                */}
                <a
                  href={`https://wa.me/${row.phoneNumber.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-border text-foreground hover:bg-border/30 inline-flex h-10 items-center gap-1.5 rounded-md border px-3 text-sm font-medium"
                >
                  <MessageCircle className="size-4" aria-hidden="true" />
                  Open message
                </a>
                <Button
                  type="button"
                  variant={marked ? 'ghost' : 'outline'}
                  loading={pendingId === row.orderId}
                  disabled={marked || pendingId === row.orderId}
                  onClick={() => markAsked(row.orderId)}
                >
                  {marked ? (
                    <>
                      <Check className="size-4" aria-hidden="true" />
                      Asked
                    </>
                  ) : (
                    'Mark as asked'
                  )}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
