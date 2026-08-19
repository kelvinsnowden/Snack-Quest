import type { Metadata } from 'next';
import { Warehouse } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { supplierRepository } from '@/repositories/supplierRepository';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SupplierFormDialog } from '@/components/admin/SupplierFormDialog';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Suppliers' };

export default async function AdminSuppliersPage() {
  const session = await requireStaffSession();
  const suppliers = await supplierRepository.listByBusiness(session.businessId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Suppliers</h1>
          <p className="hidden sm:block mt-1 text-sm text-muted-foreground">Who purchase orders are placed with.</p>
        </div>
        {suppliers.length > 0 ? <SupplierFormDialog mode="create" /> : null}
      </div>

      {suppliers.length === 0 ? (
        <EmptyState
          icon={Warehouse}
          title="No suppliers yet"
          description="Add a supplier before creating your first purchase order."
          action={<SupplierFormDialog mode="create" />}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Supplier</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {suppliers.map(({ id, data }) => (
                  <tr key={id} className="border-b border-border last:border-0 hover:bg-border/20">
                    <td className="px-4 py-3 font-medium text-foreground">{data.name}</td>
                    <td className="px-4 py-3 text-foreground">{data.contactName}</td>
                    <td className="px-4 py-3 tabular-nums text-foreground">{data.phone}</td>
                    <td className="px-4 py-3">
                      <Badge variant={data.isActive ? 'success' : 'outline'}>{data.isActive ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <SupplierFormDialog
                        mode="edit"
                        supplierId={id}
                        initialValues={{
                          name: data.name,
                          contactName: data.contactName,
                          phone: data.phone,
                          email: data.email ?? '',
                          notes: data.notes,
                          isActive: data.isActive,
                        }}
                        trigger={
                          <Button variant="outline" size="sm">
                            Edit
                          </Button>
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
