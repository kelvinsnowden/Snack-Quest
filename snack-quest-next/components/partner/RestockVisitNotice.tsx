import Link from 'next/link';
import { ArrowRight, Clock, PackageCheck, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RestockVisit } from '@/lib/vending/restockVisit';

const TIME = new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short' });

/** "14:20", or "12 Oct, 14:20" when it wasn't today (Nairobi time). */
function when(at: string): string {
  const date = new Date(at);
  const today = DAY.format(new Date()) === DAY.format(date);
  return today ? TIME.format(date) : `${DAY.format(date)}, ${TIME.format(date)}`;
}

function wording(visit: RestockVisit, code: string): { title: string; detail: string } {
  // Non-breaking hyphens: "SQ-002" never splits across lines.
  const machineCode = code.replace(/-/g, '\u2011');
  const items = `${visit.items} item${visit.items === 1 ? '' : 's'}`;
  const rider = visit.riderFirstName ?? 'A rider';
  switch (visit.stage) {
    case 'on_the_way':
      return { title: `${rider} is on the way to restock ${machineCode}`, detail: `${visit.at ? `Left at ${when(visit.at)}` : 'Set off'} with ${items}.` };
    case 'packing':
      return { title: `Restock for ${machineCode} is being packed`, detail: `${items}. It shows here when the rider sets off.` };
    case 'planned':
      return { title: `Restock planned for ${machineCode}`, detail: `${items}. It shows here when the rider sets off.` };
    case 'requested':
      return { title: `Restock requested for ${machineCode}`, detail: 'Waiting for Snack Quest to plan it.' };
    case 'restocked':
      return { title: `${machineCode} restocked${visit.at ? ` at ${when(visit.at)}` : ''}`, detail: `${items} went in.` };
  }
}

const LOOK = {
  on_the_way: { icon: Truck, tone: 'bg-primary/10 text-primary', box: 'border-primary/30 bg-primary/5' },
  restocked: { icon: PackageCheck, tone: 'bg-success/10 text-success', box: 'border-success/30 bg-success/5' },
  waiting: { icon: Clock, tone: 'bg-muted/50 text-muted-foreground', box: 'border-border bg-surface' },
} as const;

/**
 * Tells a machine's owner where its restock is: requested, planned,
 * being packed, a rider on the way (with when they set off), or done.
 * `href` makes the whole notice a link (used on the overview).
 */
export function RestockVisitNotice({ visit, machineCode, href }: { visit: RestockVisit; machineCode: string; href?: string }) {
  const look = visit.stage === 'on_the_way' ? LOOK.on_the_way : visit.stage === 'restocked' ? LOOK.restocked : LOOK.waiting;
  const Icon = look.icon;
  const { title, detail } = wording(visit, machineCode);
  const body = (
    <>
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', look.tone)}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-foreground">{title}</span>
        <span className="block text-sm text-muted-foreground">{detail}</span>
      </span>
      {href ? <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
    </>
  );
  const className = cn('flex items-center gap-3 rounded-xl border p-3', look.box);
  return href ? (
    <Link href={href} className={cn(className, 'transition-colors hover:bg-border/10')}>
      {body}
    </Link>
  ) : (
    <div role="status" className={className}>
      {body}
    </div>
  );
}
