import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  FileText,
  Clock,
  Play,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Download,
  Printer,
  Calendar,
  Mail,
  RefreshCw,
  Eye,
  X
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DataTable, Column } from '../common/DataTable';
import { StatusBadge } from '../common/StatusBadge';
import { Modal } from '../common/Modal';
import { ScheduledReport } from '../../types/database';

export const ReportingCenter: React.FC = () => {
  const { addToast, currentStaffUser } = useApp();
  const [reports, setReports] = useState<ScheduledReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previewReport, setPreviewReport] = useState<ScheduledReport | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [reportType, setReportType] = useState<'monthly_profit' | 'campaign_attribution' | 'low_stock' | 'delivery_summary'>('monthly_profit');
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [recipients, setRecipients] = useState('');
  const [format, setFormat] = useState<'pdf' | 'csv' | 'xlsx'>('pdf');

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/reports/scheduled');
      const data = await res.json();
      if (data.data) setReports(data.data);
    } catch (e) {
      console.error('Failed to load scheduled reports', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleCreateReport = async () => {
    if (!recipients.trim()) {
      addToast({ type: 'error', title: 'Validation Error', message: 'At least one recipient email required' });
      return;
    }

    const emailList = recipients.split(',').map((e) => e.trim()).filter(Boolean);

    try {
      const res = await fetch('/api/v1/reports/scheduled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          report_type: reportType,
          frequency,
          recipients: emailList,
          format,
          staff_user_id: currentStaffUser.id
        })
      });

      if (res.ok) {
        addToast({ type: 'success', title: 'Report Scheduled', message: 'Automated report configuration saved' });
        setIsModalOpen(false);
        setTitle('');
        setRecipients('');
        fetchReports();
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: 'Failed to schedule report' });
    }
  };

  const handleRunNow = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/reports/scheduled/${id}/run-now`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_user_id: currentStaffUser.id })
      });
      const data = await res.json();
      if (res.ok) {
        addToast({ type: 'success', title: 'Report Executed', message: data.message });
        fetchReports();
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: 'Failed to run report' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/reports/scheduled/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_user_id: currentStaffUser.id })
      });
      if (res.ok) {
        addToast({ type: 'success', title: 'Report Deleted', message: 'Scheduled report removed' });
        fetchReports();
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: 'Could not delete report' });
    }
  };

  const columns: Column<ScheduledReport>[] = [
    {
      header: 'Report Title',
      accessorKey: 'title',
      cell: (row) => (
        <div>
          <p className="text-xs font-bold text-white">{row.title}</p>
          <p className="text-[10px] font-mono text-[#71717A] uppercase">{row.report_type.replace('_', ' ')}</p>
        </div>
      )
    },
    {
      header: 'Frequency',
      accessorKey: 'frequency',
      cell: (row) => (
        <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-[#18181B] text-amber-400 border border-[#27272A] uppercase">
          {row.frequency}
        </span>
      )
    },
    {
      header: 'Format',
      accessorKey: 'format',
      cell: (row) => (
        <span className="text-xs font-mono font-bold text-white uppercase">{row.format}</span>
      )
    },
    {
      header: 'Recipients',
      accessorKey: 'recipients',
      cell: (row) => (
        <span className="text-xs text-[#A1A1AA] truncate max-w-xs">{row.recipients.join(', ')}</span>
      )
    },
    {
      header: 'Last Run',
      accessorKey: 'last_run_at',
      cell: (row) => (
        <span className="text-xs text-[#71717A]">
          {row.last_run_at ? new Date(row.last_run_at).toLocaleDateString() : 'Never'}
        </span>
      )
    },
    {
      header: 'Actions',
      accessorKey: 'id',
      cell: (row) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => setPreviewReport(row)}
            className="p-1.5 rounded-lg bg-[#18181B] text-[#A1A1AA] hover:text-white hover:bg-[#27272A]"
            title="Preview PDF Format"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleRunNow(row.id)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-xs font-semibold"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Run Now
          </button>
          <button
            onClick={() => handleDelete(row.id)}
            className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10"
            title="Delete Schedule"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#27272A] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-amber-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">Advanced Reporting & Scheduled Exports</h1>
          </div>
          <p className="text-xs text-[#A1A1AA] mt-1">
            Automate executive P&amp;L reports, daily stock alerts, and campaign ROAS digests dispatched directly to stakeholders.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Schedule New Report
        </button>
      </div>

      {/* Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Configured Automated Reports ({reports.length})</h3>
          <button
            onClick={fetchReports}
            className="p-1.5 rounded-lg bg-[#18181B] text-[#A1A1AA] hover:text-white border border-[#27272A]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>
        <DataTable data={reports} columns={columns} searchKey="title" />
      </div>

      {/* Schedule Modal */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Schedule Automated Report Dispatch"
        >
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-[#A1A1AA]">Report Title</label>
              <input
                type="text"
                placeholder="e.g. Monthly Executive Profit & CAC Summary"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full mt-1.5 bg-[#18181B] border border-[#27272A] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-[#A1A1AA]">Report Type</label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value as any)}
                  className="w-full mt-1.5 bg-[#18181B] border border-[#27272A] rounded-lg p-2.5 text-xs text-white focus:outline-none"
                >
                  <option value="monthly_profit">Monthly Profit &amp; Unit Economics</option>
                  <option value="campaign_attribution">Campaign ROAS &amp; CAC</option>
                  <option value="low_stock">Low Stock &amp; Reorder Alert</option>
                  <option value="delivery_summary">Delivery Dispatch Metrics</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#A1A1AA]">Frequency</label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as any)}
                  className="w-full mt-1.5 bg-[#18181B] border border-[#27272A] rounded-lg p-2.5 text-xs text-white focus:outline-none"
                >
                  <option value="daily">Daily Digest</option>
                  <option value="weekly">Weekly Digest</option>
                  <option value="monthly">Monthly Executive Summary</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-[#A1A1AA]">Output Format</label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as any)}
                  className="w-full mt-1.5 bg-[#18181B] border border-[#27272A] rounded-lg p-2.5 text-xs text-white focus:outline-none"
                >
                  <option value="pdf">PDF (Printable Executive Report)</option>
                  <option value="csv">CSV (Raw Data)</option>
                  <option value="xlsx">Excel Workbook (XLSX)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#A1A1AA]">Recipient Emails (comma separated)</label>
                <input
                  type="text"
                  placeholder="admin@snackquests.shop, finance@snackquests.shop"
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                  className="w-full mt-1.5 bg-[#18181B] border border-[#27272A] rounded-lg p-2.5 text-xs text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-[#18181B] text-xs font-medium text-white hover:bg-[#27272A]"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateReport}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold"
              >
                Schedule Report
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* PDF Ready Report Preview Modal */}
      {previewReport && (
        <Modal
          isOpen={!!previewReport}
          onClose={() => setPreviewReport(null)}
          title={`Print Preview: ${previewReport.title}`}
        >
          <div className="space-y-6 bg-white text-black p-6 rounded-lg font-sans">
            <div className="border-b pb-4 flex justify-between items-start">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-gray-900">Snack Quest Operating System</h1>
                <p className="text-xs text-gray-500 uppercase font-mono mt-0.5">{previewReport.title}</p>
              </div>
              <div className="text-right text-xs text-gray-500">
                <p>Date: {new Date().toLocaleDateString()}</p>
                <p>Generated by System</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 bg-gray-50 p-4 rounded border text-xs">
              <div>
                <span className="text-gray-500 block">Report Type</span>
                <span className="font-bold text-gray-900 uppercase">{previewReport.report_type}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Frequency</span>
                <span className="font-bold text-gray-900 uppercase">{previewReport.frequency}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Recipients</span>
                <span className="font-bold text-gray-900">{previewReport.recipients.length} Configured</span>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <h3 className="font-bold text-gray-900 text-sm border-b pb-1">Executive Summary Metrics</h3>
              <div className="grid grid-cols-2 gap-4 pt-1">
                <div className="border p-3 rounded">
                  <span className="text-gray-500 block">Gross Revenue (KES)</span>
                  <span className="text-lg font-bold text-emerald-600">KES 2,450,000</span>
                </div>
                <div className="border p-3 rounded">
                  <span className="text-gray-500 block">Net Profit Margin</span>
                  <span className="text-lg font-bold text-gray-900">38.4%</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t text-xs">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white font-bold rounded"
              >
                <Printer className="w-3.5 h-3.5" />
                Print PDF Report
              </button>
              <button
                onClick={() => setPreviewReport(null)}
                className="px-3 py-1.5 bg-gray-200 text-gray-800 font-bold rounded"
              >
                Close Preview
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
