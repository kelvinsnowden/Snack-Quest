import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Mail, Shield, Check, X, RefreshCw, Power } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { StaffUser, Role } from '../../types/database';
import { DataTable, Column } from '../common/DataTable';
import { StatusBadge } from '../common/StatusBadge';
import { Modal } from '../common/Modal';

export const StaffUsersTable: React.FC = () => {
  const { addToast, triggerRefetch, refetchKey } = useApp();
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Invite Modal
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchStaffData = async () => {
    setIsLoading(true);
    try {
      const [staffRes, rolesRes] = await Promise.all([
        fetch('/api/v1/staff'),
        fetch('/api/v1/roles')
      ]);

      if (staffRes.ok) {
        const data = await staffRes.json();
        setStaffUsers(data.data || []);
      }
      if (rolesRes.ok) {
        const data = await rolesRes.json();
        setRoles(data.roles || []);
        if (data.roles.length && !inviteRoleId) {
          setInviteRoleId(data.roles[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to fetch staff data', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStaffData();
  }, [refetchKey]);

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName || !inviteEmail || !inviteRoleId) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/v1/auth/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: inviteName,
          email: inviteEmail,
          role_id: inviteRoleId
        })
      });

      if (res.ok) {
        const data = await res.json();
        addToast({
          type: 'success',
          title: 'Staff Member Invited',
          message: `Invite generated for ${inviteName}. Link: ${data.invite_link}`
        });
        setIsInviteOpen(false);
        setInviteName('');
        setInviteEmail('');
        fetchStaffData();
        triggerRefetch();
      } else {
        const err = await res.json();
        addToast({ type: 'error', title: 'Invite Failed', message: err.error || 'Could not invite user' });
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: 'Network request failed' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (user: StaffUser) => {
    const newStatus = !user.is_active;
    try {
      const res = await fetch(`/api/v1/staff/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newStatus })
      });

      if (res.ok) {
        addToast({
          type: 'info',
          title: 'Staff Status Updated',
          message: `${user.full_name} is now ${newStatus ? 'Active' : 'Deactivated'}`
        });
        fetchStaffData();
        triggerRefetch();
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: 'Failed to update user status' });
    }
  };

  const handleRoleChange = async (user: StaffUser, newRoleId: string) => {
    try {
      const res = await fetch(`/api/v1/staff/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_id: newRoleId })
      });

      if (res.ok) {
        addToast({
          type: 'success',
          title: 'Role Reassigned',
          message: `Updated role for ${user.full_name}`
        });
        fetchStaffData();
        triggerRefetch();
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: 'Failed to update user role' });
    }
  };

  const columns: Column<StaffUser>[] = [
    {
      header: 'Staff Member',
      accessorKey: 'full_name',
      cell: (row) => (
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-orange-400 to-pink-500 text-white font-bold flex items-center justify-center text-xs">
            {row.full_name.charAt(0)}
          </div>
          <div>
            <p className="font-medium text-white">{row.full_name}</p>
            <p className="text-[11px] text-[#71717A]">{row.email}</p>
          </div>
        </div>
      ),
      sortable: true
    },
    {
      header: 'Assigned Role',
      accessorKey: 'role_id',
      cell: (row) => {
        const userRole = roles.find((r) => r.id === row.role_id);
        return (
          <select
            value={row.role_id}
            onChange={(e) => handleRoleChange(row, e.target.value)}
            className="px-2 py-1 text-xs rounded-md border border-[#27272A] bg-[#18181B] text-white focus:outline-none focus:border-blue-500 cursor-pointer font-medium"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        );
      }
    },
    {
      header: 'Account Status',
      accessorKey: 'is_active',
      cell: (row) => <StatusBadge status={row.is_active ? 'active' : 'cancelled'} label={row.is_active ? 'ACTIVE STAFF' : 'DEACTIVATED'} size="sm" />
    },
    {
      header: 'Last Operating Login',
      accessorKey: 'last_login_at',
      cell: (row) => (
        <span className="text-[11px] font-mono text-[#71717A]">
          {row.last_login_at ? new Date(row.last_login_at).toLocaleString() : 'Never logged in'}
        </span>
      ),
      sortable: true
    },
    {
      header: 'Actions',
      cell: (row) => (
        <button
          onClick={() => handleToggleStatus(row)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
            row.is_active
              ? 'border-red-500/20 bg-red-500/10 text-red-500 hover:bg-red-500/20'
              : 'border-green-500/20 bg-green-500/10 text-green-500 hover:bg-green-500/20'
          }`}
        >
          <Power className="h-3.5 w-3.5" />
          <span>{row.is_active ? 'Deactivate' : 'Reactivate'}</span>
        </button>
      )
    }
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <DataTable
        title="Staff User Directory (Invite-Only Access Control)"
        description="Manage internal staff accounts, role assignments, and active session status."
        data={staffUsers}
        columns={columns}
        searchKey="full_name"
        exportFilename="snack_quest_staff_directory"
        actions={
          <button
            onClick={() => setIsInviteOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>Invite Staff Member</span>
          </button>
        }
      />

      {/* Invite Staff Modal */}
      <Modal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        title="Invite New Staff Member"
        description="Invited users receive a secure magic invite key mapped to their assigned role."
      >
        <form onSubmit={handleInviteSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#A1A1AA]">
              Full Legal Name
            </label>
            <input
              type="text"
              required
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="e.g. Grace Nyambura"
              className="mt-1 w-full px-3 py-2 text-xs rounded-md border border-[#27272A] bg-[#09090B] text-white placeholder-[#71717A] focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#A1A1AA]">
              Corporate Email Address
            </label>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="grace@snackquest.com"
              className="mt-1 w-full px-3 py-2 text-xs rounded-md border border-[#27272A] bg-[#09090B] text-white placeholder-[#71717A] focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#A1A1AA]">
              Assigned Role
            </label>
            <select
              value={inviteRoleId}
              onChange={(e) => setInviteRoleId(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-xs rounded-md border border-[#27272A] bg-[#09090B] text-white focus:outline-none focus:border-blue-500"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} — {r.description}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-3 border-t border-[#27272A] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsInviteOpen(false)}
              className="px-3.5 py-2 text-xs font-medium rounded-md border border-[#27272A] bg-[#18181B] text-white hover:bg-[#27272A] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer"
            >
              {isSubmitting ? 'Generating Invite...' : 'Send Staff Invite'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
