import type { Metadata } from 'next';
import { ClipboardList, MessageCircleWarning, Users } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { orderRepository } from '@/repositories/orderRepository';
import { conversationRepository } from '@/repositories/conversationRepository';
import { staffRepository } from '@/repositories/staffRepository';
import { businessRepository } from '@/repositories/businessRepository';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Dashboard' };

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'default' | 'warning';
}

function StatCard({ label, value, icon: Icon, tone = 'default' }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-6">
        <div>
          <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{value.toLocaleString()}</p>
        </div>
        <div
          className={
            'flex size-10 shrink-0 items-center justify-center rounded-md ' +
            (tone === 'warning' ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary')
          }
        >
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export default async function AdminDashboardPage() {
  const session = await requireStaffSession();

  const [business, totalOrders, agentQueueCount, staff] = await Promise.all([
    businessRepository.findById(session.businessId),
    orderRepository.countByBusiness(session.businessId),
    conversationRepository.countByStatus(session.businessId, 'agent_assigned'),
    staffRepository.listByBusiness(session.businessId),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">
          Welcome back, {session.displayName.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here&apos;s what&apos;s happening at {business?.name ?? 'Snack Quest'} right now.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total orders" value={totalOrders} icon={ClipboardList} />
        <StatCard
          label="Awaiting a human agent"
          value={agentQueueCount}
          icon={MessageCircleWarning}
          tone={agentQueueCount > 0 ? 'warning' : 'default'}
        />
        <StatCard label="Staff members" value={staff.length} icon={Users} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>More is on the way</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-muted-foreground">
          Orders, products, inventory, creators, and delivery monitoring are next on the build — each one
          lands here with real data and its own place in the sidebar the moment it&apos;s ready, never before.
        </CardContent>
      </Card>
    </div>
  );
}
