'use client';

import { useState } from 'react';
import { Eye } from 'lucide-react';
import type { Role } from '@/types';
import { VIEWABLE_ROLES } from '@/lib/auth/viewAs';
import { cn } from '@/lib/utils';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  agent: 'Agent',
  warehouse: 'Warehouse',
  finance: 'Finance',
};

/**
 * A super admin stepping into another role, and the way back out
 * (§ see it from every angle).
 *
 * Rendered in every staff shell, not just the Admin one, and that is
 * the whole reason it can be used: choosing `warehouse` sends you to
 * the Warehouse workspace, so a control that only existed in Admin
 * would be a door that locks behind you.
 *
 * While a role is on, this is a banner rather than a quiet menu item.
 * The narrowing is real — admin endpoints will refuse you — so a super
 * admin who forgot they were wearing another hat would read a genuine
 * 403 as a bug in the product.
 */
export function ViewAsSwitcher({ viewingAs }: { viewingAs?: Role }) {
  const [busy, setBusy] = useState(false);

  async function choose(role: Role | null) {
    setBusy(true);
    try {
      await fetch('/api/admin/view-as', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      /*
       * A full load of `/admin`, not `router.refresh()`. The session
       * is read on the server for every route in the tree and the
       * whole shell changes, navigation included.
       *
       * `/admin` either way: the Admin layout sends a session holding
       * only agent, warehouse or finance to that workspace, so
       * choosing a role lands in the right place without this needing
       * to know where that is.
       */
      window.location.href = '/admin';
    } finally {
      setBusy(false);
    }
  }

  if (viewingAs) {
    return (
      <div className="bg-warning/15 border-warning/40 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2 md:px-6">
        <span className="text-foreground flex items-center gap-2 text-sm">
          <Eye className="size-4 shrink-0" aria-hidden="true" />
          Viewing as <strong>{ROLE_LABELS[viewingAs] ?? viewingAs}</strong>. You have this
          role&apos;s permissions, not your own.
        </span>
        <button
          type="button"
          onClick={() => choose(null)}
          disabled={busy}
          className="text-foreground hover:bg-warning/20 border-warning/50 rounded-md border px-3 py-1 text-sm font-medium disabled:opacity-50"
        >
          Back to super admin
        </button>
      </div>
    );
  }

  return (
    <div className="border-border flex flex-wrap items-center gap-2 border-b px-4 py-2 md:px-6">
      <span className="text-muted-foreground flex items-center gap-2 text-caption">
        <Eye className="size-3.5 shrink-0" aria-hidden="true" />
        View as
      </span>
      {VIEWABLE_ROLES.map((role) => (
        <button
          key={role}
          type="button"
          onClick={() => choose(role)}
          disabled={busy}
          className={cn(
            'border-border text-muted-foreground hover:bg-border/40 hover:text-foreground rounded-md border px-2.5 py-1 text-caption transition-colors disabled:opacity-50',
          )}
        >
          {ROLE_LABELS[role] ?? role}
        </button>
      ))}
    </div>
  );
}
