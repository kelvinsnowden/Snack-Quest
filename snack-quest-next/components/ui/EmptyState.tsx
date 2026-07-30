'use client';

import React from 'react';
import { FolderOpen } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ElementType;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = FolderOpen,
  title,
  description,
  actionLabel,
  onAction,
}) => {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-12 text-center shadow-2xs dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 rounded-full bg-amber-500/10 p-3 text-amber-500">
        <Icon className="h-8 w-8" />
      </div>
      <h3 className="mb-1 text-base font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </h3>
      <p className="mb-6 max-w-sm text-xs text-slate-500 dark:text-slate-400">
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 shadow-xs transition-colors hover:bg-amber-600"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
