import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, Eye, Filter, RefreshCw, Calendar, User, Database } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AuditLog } from '../../types/database';
import { DataTable, Column } from '../common/DataTable';
import { StatusBadge } from '../common/StatusBadge';
import { Drawer } from '../common/Modal';

export const AuditLogViewer: React.FC = () => {
  const { addToast, refetchKey } = useApp();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [tableFilter, setTableFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchAuditLogs = async () => {
    setIsLoading(true);
    try {
      let url = `/api/v1/audit-logs?page=${page}&limit=20`;
      if (actionFilter) url += `&action=${actionFilter}`;
      if (tableFilter) url += `&table_name=${tableFilter}`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.data || []);
        setTotalCount(data.pagination?.total || 0);
      }
    } catch (e) {
      console.error('Failed to fetch audit logs', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [page, actionFilter, tableFilter, refetchKey]);

  const columns: Column<AuditLog>[] = [
    {
      header: 'Timestamp',
      accessorKey: 'created_at',
      cell: (row) => (
        <span className="font-mono text-xs text-[#A1A1AA]">
          {new Date(row.created_at).toLocaleString()}
        </span>
      ),
      sortable: true
    },
    {
      header: 'Staff Actor',
      accessorKey: 'staff_user_name',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 text-blue-500" />
          <span className="font-medium text-white">{row.staff_user_name || 'System / External API'}</span>
        </div>
      ),
      sortable: true
    },
    {
      header: 'Action',
      accessorKey: 'action',
      cell: (row) => {
        let badgeType = 'info';
        if (row.action === 'create') badgeType = 'active';
        if (row.action === 'update') badgeType = 'pending';
        if (row.action === 'delete') badgeType = 'failed';
        if (row.action === 'approve') badgeType = 'paid';
        return <StatusBadge status={badgeType} label={row.action.toUpperCase()} size="sm" />;
      },
      sortable: true
    },
    {
      header: 'Table Name',
      accessorKey: 'table_name',
      cell: (row) => (
        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-[#18181B] text-[#A1A1AA] border border-[#27272A]">
          {row.table_name}
        </span>
      ),
      sortable: true
    },
    {
      header: 'Record ID',
      accessorKey: 'record_id',
      cell: (row) => (
        <span className="font-mono text-[11px] text-[#71717A]">
          {row.record_id?.substring(0, 12)}...
        </span>
      )
    },
    {
      header: 'IP Address',
      accessorKey: 'ip_address',
      cell: (row) => (
        <span className="font-mono text-[11px] text-[#71717A]">
          {row.ip_address}
        </span>
      )
    },
    {
      header: 'Diff Inspector',
      cell: (row) => (
        <button
          onClick={() => setSelectedLog(row)}
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-500 hover:underline cursor-pointer"
        >
          <Eye className="h-3.5 w-3.5" />
          <span>Inspect Changes</span>
        </button>
      )
    }
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <DataTable
        title="Immutable Staff Audit Trail Log"
        description="Every staff creation, update, deletion, role edit, or login generates a non-deletable audit record."
        data={logs}
        columns={columns}
        searchKey="table_name"
        exportFilename="snack_quest_audit_logs"
        actions={
          <div className="flex items-center gap-2">
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-md border border-[#27272A] bg-[#18181B] text-white focus:outline-none focus:border-blue-500 font-medium cursor-pointer"
            >
              <option value="">All Actions</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
              <option value="login">Login</option>
            </select>

            <button
              onClick={fetchAuditLogs}
              className="p-1.5 rounded-md border border-[#27272A] bg-[#18181B] text-[#A1A1AA] hover:text-white hover:bg-[#27272A] cursor-pointer transition-colors"
              title="Refresh logs"
            >
              <RefreshCw className="h-3.5 w-3.5 text-blue-500" />
            </button>
          </div>
        }
      />

      {/* Audit Record State Diff Inspection Drawer */}
      <Drawer
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title={`Audit State Inspection: ${selectedLog?.action?.toUpperCase()} on ${selectedLog?.table_name}`}
      >
        {selectedLog && (
          <div className="space-y-5">
            <div className="p-3 bg-[#09090B] border border-[#27272A] rounded-md space-y-1 text-xs">
              <p>
                <strong className="text-[#71717A]">Actor:</strong>{' '}
                <span className="font-bold text-white">{selectedLog.staff_user_name || 'System'}</span>
              </p>
              <p>
                <strong className="text-[#71717A]">Record ID:</strong>{' '}
                <span className="font-mono text-[#A1A1AA]">{selectedLog.record_id}</span>
              </p>
              <p>
                <strong className="text-[#71717A]">Timestamp:</strong>{' '}
                <span className="font-mono text-[#A1A1AA]">{new Date(selectedLog.created_at).toISOString()}</span>
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <p className="text-xs font-bold text-red-500 uppercase tracking-wider mb-1">State Before Change</p>
                <pre className="p-3 font-mono text-xs rounded-md bg-[#09090B] text-red-400 border border-[#27272A] overflow-x-auto">
                  {selectedLog.before ? JSON.stringify(selectedLog.before, null, 2) : 'null (New Record)'}
                </pre>
              </div>

              <div>
                <p className="text-xs font-bold text-green-500 uppercase tracking-wider mb-1">State After Change</p>
                <pre className="p-3 font-mono text-xs rounded-md bg-[#09090B] text-green-400 border border-[#27272A] overflow-x-auto">
                  {selectedLog.after ? JSON.stringify(selectedLog.after, null, 2) : 'null (Deleted Record)'}
                </pre>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
