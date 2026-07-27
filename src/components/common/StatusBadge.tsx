import React from 'react';

interface StatusBadgeProps {
  status: string;
  label?: string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label, size = 'md' }) => {
  const displayLabel = label || status.replace(/_/g, ' ').toUpperCase();

  let colorClasses = 'bg-gray-500/10 text-gray-400 border-gray-500/20';

  const lower = status.toLowerCase();

  if (['active', 'paid', 'delivered', 'approved', 'processed', 'qualified', 'succeeded', 'in_stock', 'received', 'success', '100% ok'].includes(lower)) {
    colorClasses = 'bg-green-500/10 text-green-500 border-green-500/20';
  } else if (['pending', 'initiated', 'queued', 'low_stock', 'partially_paid', 'partially_received', 'ordered'].includes(lower)) {
    colorClasses = 'bg-orange-500/10 text-orange-500 border-orange-500/20';
  } else if (['failed', 'cancelled', 'rejected', 'blacklisted', 'out_of_stock', 'fraud_flagged'].includes(lower)) {
    colorClasses = 'bg-red-500/10 text-red-500 border-red-500/20';
  } else if (['confirmed', 'packed', 'dispatched', 'collected', 'in_transit', 'update'].includes(lower)) {
    colorClasses = 'bg-blue-500/10 text-blue-500 border-blue-500/20';
  } else if (['vip', 'rewarded', 'invite'].includes(lower)) {
    colorClasses = 'bg-purple-500/10 text-purple-500 border-purple-200/20';
  }

  const padding = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border font-bold uppercase tracking-wider ${padding} ${colorClasses} whitespace-nowrap`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {displayLabel}
    </span>
  );
};
