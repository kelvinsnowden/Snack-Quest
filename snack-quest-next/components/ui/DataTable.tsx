'use client';

// Ported verbatim from the current Vite app, which uses `any` for the
// generic row-shape constraint. The Next.js project's ESLint config is
// stricter than the source project's; disabling here rather than
// changing the signature, per the "port verbatim, fix import paths
// only" instruction.
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Search,
  Filter,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import { exportToCsv, exportToXlsx } from '@/lib/export';

export interface Column<T> {
  header: string;
  accessorKey?: keyof T | string;
  cell?: (row: T) => React.ReactNode;
  sortable?: boolean;
}

interface DataTableProps<T> {
  title?: string;
  description?: string;
  data: T[];
  columns: Column<T>[];
  searchKey?: keyof T | string;
  searchPlaceholder?: string;
  pageSize?: number;
  exportFilename?: string;
  onRowClick?: (row: T) => void;
  actions?: React.ReactNode;
}

export function DataTable<T extends Record<string, any>>({
  title,
  description,
  data,
  columns,
  searchKey,
  searchPlaceholder = 'Search records...',
  pageSize = 10,
  exportFilename = 'export_data',
  onRowClick,
  actions,
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Filter
  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    const q = searchTerm.toLowerCase();
    return data.filter((item) => {
      if (searchKey && item[searchKey as string]) {
        return String(item[searchKey as string])
          .toLowerCase()
          .includes(q);
      }
      return Object.values(item).some((val) =>
        String(val || '')
          .toLowerCase()
          .includes(q),
      );
    });
  }, [data, searchTerm, searchKey]);

  // Sort
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    return [...filteredData].sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortKey, sortOrder]);

  // Paginate
  const totalPages = Math.ceil(sortedData.length / pageSize) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  const getValue = (row: T, accessor: string) => {
    return row[accessor];
  };

  return (
    <div className="w-full overflow-hidden rounded-lg border border-[#27272A] bg-[#09090B] transition-colors">
      {/* Header Bar */}
      {(title || actions || searchKey) && (
        <div className="flex flex-col justify-between gap-4 border-b border-[#27272A] bg-[#09090B] p-4 sm:flex-row sm:items-center sm:p-5">
          <div>
            {title && (
              <h3 className="text-base font-semibold tracking-tight text-white">
                {title}
              </h3>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-[#71717A]">{description}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[#71717A]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder={searchPlaceholder}
                className="w-full rounded-md border border-[#27272A] bg-[#18181B] py-1.5 pr-3 pl-9 text-xs text-white placeholder-[#71717A] transition-colors focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Custom Action Slots */}
            {actions}

            {/* Export Actions */}
            <div className="flex items-center gap-1 border-l border-[#27272A] pl-2">
              <button
                type="button"
                onClick={() => exportToCsv(exportFilename, filteredData)}
                title="Export filtered records to CSV"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[#27272A] bg-[#18181B] px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#27272A]"
              >
                <FileText className="h-3.5 w-3.5 text-blue-400" />
                <span>CSV</span>
              </button>
              <button
                type="button"
                onClick={() => exportToXlsx(exportFilename, filteredData)}
                title="Export filtered records to Excel XLSX"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[#27272A] bg-[#18181B] px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#27272A]"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-green-400" />
                <span>Excel</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table Container */}
      <div className="min-h-[160px] overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[#27272A] bg-[#18181B]">
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className="px-4 py-3 text-xs font-semibold tracking-wider text-[#71717A] uppercase select-none"
                  onClick={() =>
                    col.sortable && col.accessorKey
                      ? handleSort(col.accessorKey as string)
                      : undefined
                  }
                >
                  <div className="flex cursor-pointer items-center gap-1.5 transition-colors hover:text-white">
                    <span>{col.header}</span>
                    {col.sortable && col.accessorKey && (
                      <ArrowUpDown className="h-3 w-3 text-[#71717A] hover:text-white" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#27272A] text-sm text-[#A1A1AA]">
            {paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-[#71717A]"
                >
                  <div className="flex flex-col items-center justify-center gap-1">
                    <Filter className="mb-1 h-6 w-6 text-[#71717A] opacity-60" />
                    <p className="font-medium text-white">No records found</p>
                    <p className="text-xs text-[#71717A]">
                      Try adjusting your search criteria or filters
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rIdx) => (
                <tr
                  key={row.id || rIdx}
                  onClick={() => onRowClick && onRowClick(row)}
                  className={`transition-colors hover:bg-[#18181B]/60 ${
                    onRowClick ? 'cursor-pointer' : ''
                  }`}
                >
                  {columns.map((col, cIdx) => (
                    <td key={cIdx} className="px-4 py-3 align-middle">
                      {col.cell
                        ? col.cell(row)
                        : col.accessorKey
                          ? String(
                              getValue(row, col.accessorKey as string) ?? '-',
                            )
                          : '-'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      <div className="flex items-center justify-between border-t border-[#27272A] bg-[#09090B] p-4 text-xs text-[#71717A]">
        <div>
          Showing{' '}
          <span className="font-semibold text-white">
            {sortedData.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
          </span>{' '}
          to{' '}
          <span className="font-semibold text-white">
            {Math.min(currentPage * pageSize, sortedData.length)}
          </span>{' '}
          of{' '}
          <span className="font-semibold text-white">{sortedData.length}</span>{' '}
          records
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="cursor-pointer rounded-md border border-[#27272A] bg-[#18181B] p-1.5 text-white transition-colors hover:bg-[#27272A] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="cursor-pointer rounded-md border border-[#27272A] bg-[#18181B] p-1.5 text-white transition-colors hover:bg-[#27272A] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
