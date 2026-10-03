import { Badge } from '@/components/ui/badge';
import type { OwnerSaleStatus } from '@/services/ownerPortalService';

const LABEL: Record<OwnerSaleStatus, { text: string; variant: 'success' | 'warning' | 'outline' | 'danger' }> = {
  sold: { text: 'Sold', variant: 'success' },
  under_review: { text: 'Being checked', variant: 'warning' },
  refund_due: { text: 'Refund due', variant: 'danger' },
  refunded: { text: 'Refunded', variant: 'outline' },
  in_progress: { text: 'In progress', variant: 'outline' },
};

/** Where a paid sale on the owner's machine stands. Only "Sold" counts towards their sales and settlements. */
export function SaleStatusPill({ status }: { status: OwnerSaleStatus }) {
  const { text, variant } = LABEL[status];
  return <Badge variant={variant}>{text}</Badge>;
}
