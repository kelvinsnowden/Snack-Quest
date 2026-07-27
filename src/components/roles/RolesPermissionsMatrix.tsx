import React, { useState, useEffect } from 'react';
import { ShieldCheck, Check, X, Lock, Save, RefreshCw, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Role, RolePermission } from '../../types/database';
import { StatusBadge } from '../common/StatusBadge';

export const RolesPermissionsMatrix: React.FC = () => {
  const { addToast, currentRole, triggerRefetch, refetchKey } = useApp();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savingPermId, setSavingPermId] = useState<string | null>(null);

  const fetchRolesData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/roles');
      if (res.ok) {
        const data = await res.json();
        setRoles(data.roles || []);
        setPermissions(data.permissions || []);
        if (!selectedRole && data.roles.length) {
          setSelectedRole(data.roles[0]);
        }
      }
    } catch (e) {
      console.error('Failed to fetch roles', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRolesData();
  }, [refetchKey]);

  const handleTogglePermission = async (
    permission: RolePermission,
    field: 'can_view' | 'can_create' | 'can_edit' | 'can_delete' | 'can_approve'
  ) => {
    // If Administrator role, protect against turning off view/edit for security
    if (selectedRole?.name === 'Administrator' && field === 'can_view' && permission.module === 'settings') {
      addToast({
        type: 'warning',
        title: 'Security Policy Safeguard',
        message: 'Administrator settings view access cannot be revoked.'
      });
      return;
    }

    const newValue = !permission[field];
    setSavingPermId(permission.id);

    // Optimistic UI update
    setPermissions((prev) =>
      prev.map((p) => (p.id === permission.id ? { ...p, [field]: newValue } : p))
    );

    try {
      const res = await fetch(`/api/v1/permissions/${permission.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: newValue })
      });

      if (res.ok) {
        addToast({
          type: 'success',
          title: 'Permission Updated',
          message: `Updated ${field} for ${permission.module} module under ${selectedRole?.name}`
        });
        triggerRefetch();
      } else {
        // Revert on error
        setPermissions((prev) =>
          prev.map((p) => (p.id === permission.id ? { ...p, [field]: !newValue } : p))
        );
        addToast({ type: 'error', title: 'Update Failed', message: 'Could not save permission change' });
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: 'Network request failed' });
    } finally {
      setSavingPermId(null);
    }
  };

  const currentRolePermissions = permissions.filter((p) => p.role_id === selectedRole?.id);

  const modulesList = [
    { key: 'dashboard', label: 'Dashboard Shell', desc: 'Platform operational overview' },
    { key: 'settings', label: 'Settings & Staff Users', desc: 'Roles, permissions matrix & staff invites' },
    { key: 'audit', label: 'Audit Trail Logs', desc: 'Immutable security log viewer' },
    { key: 'integrations', label: 'Integration Center', desc: 'Webhooks, Make scenarios & API monitoring' },
    { key: 'crm', label: 'Customer CRM', desc: 'Customer details & lifetime value' },
    { key: 'orders', label: 'Order Processing', desc: 'Order lifecycle & payments' },
    { key: 'inventory', label: 'Inventory & Snacks', desc: 'Snack batches & packaging requirements' },
    { key: 'deliveries', label: 'Delivery Dispatch', desc: 'Courier assignments & POD' },
    { key: 'rewards', label: 'Rewards & Wallet', desc: 'Submission reviews & wallet transactions' },
    { key: 'accounting', label: 'Accounting & Expenses', desc: 'Operating expenses & profit analysis' }
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-500" />
            <span>Staff Roles & Granular Permissions Matrix</span>
          </h2>
          <p className="text-xs text-[#71717A] mt-0.5">
            PostgreSQL RLS policies are generated dynamically from these rules. Changes take effect immediately without a redeploy.
          </p>
        </div>

        <button
          onClick={fetchRolesData}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border border-[#27272A] bg-[#18181B] text-white hover:bg-[#27272A] cursor-pointer transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5 text-blue-500" />
          <span>Refresh Matrix</span>
        </button>
      </div>

      {/* Role Selection Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-[#27272A]">
        {roles.map((r) => {
          const isSelected = selectedRole?.id === r.id;
          return (
            <button
              key={r.id}
              onClick={() => setSelectedRole(r)}
              className={`px-4 py-2 text-xs font-medium rounded-md transition-all whitespace-nowrap cursor-pointer ${
                isSelected
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'bg-[#18181B] border border-[#27272A] text-[#A1A1AA] hover:text-white hover:bg-[#27272A]'
              }`}
            >
              {r.name}
            </button>
          );
        })}
      </div>

      {/* Active Role Description Banner */}
      {selectedRole && (
        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-md flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-blue-500" />
            <div>
              <h3 className="text-xs font-bold text-blue-400">
                {selectedRole.name} Role Policy Matrix
              </h3>
              <p className="text-xs text-[#A1A1AA]">
                {selectedRole.description}
              </p>
            </div>
          </div>
          <StatusBadge status="active" label="POLICY ENFORCED" size="sm" />
        </div>
      )}

      {/* Permissions Table Matrix */}
      <div className="bg-[#09090B] border border-[#27272A] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#18181B] border-b border-[#27272A] text-[#71717A] font-semibold uppercase tracking-wider">
                <th className="px-5 py-3">Module Tag</th>
                <th className="px-4 py-3 text-center">Can View</th>
                <th className="px-4 py-3 text-center">Can Create</th>
                <th className="px-4 py-3 text-center">Can Edit</th>
                <th className="px-4 py-3 text-center">Can Delete</th>
                <th className="px-4 py-3 text-center">Can Approve</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#27272A]">
              {modulesList.map((m) => {
                const perm = currentRolePermissions.find((p) => p.module === m.key);

                if (!perm) return null;

                const renderCheckbox = (field: 'can_view' | 'can_create' | 'can_edit' | 'can_delete' | 'can_approve') => {
                  const checked = perm[field];
                  const isSaving = savingPermId === perm.id;

                  return (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleTogglePermission(perm, field)}
                      className={`h-5 w-5 rounded border flex items-center justify-center transition-all mx-auto cursor-pointer ${
                        checked
                          ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                          : 'bg-[#18181B] border-[#27272A] text-transparent hover:border-blue-500'
                      }`}
                    >
                      {checked && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                    </button>
                  );
                };

                return (
                  <tr key={m.key} className="hover:bg-[#18181B]/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-white">{m.label}</p>
                      <p className="text-[11px] text-[#71717A]">{m.desc}</p>
                    </td>
                    <td className="px-4 py-3.5 text-center">{renderCheckbox('can_view')}</td>
                    <td className="px-4 py-3.5 text-center">{renderCheckbox('can_create')}</td>
                    <td className="px-4 py-3.5 text-center">{renderCheckbox('can_edit')}</td>
                    <td className="px-4 py-3.5 text-center">{renderCheckbox('can_delete')}</td>
                    <td className="px-4 py-3.5 text-center">{renderCheckbox('can_approve')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
