'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'System Alert',
  message = 'An unexpected error occurred while processing this request.',
  onRetry,
}) => {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/5 p-10 text-center">
      <AlertTriangle className="mb-3 h-8 w-8 text-rose-500" />
      <h3 className="mb-1 text-sm font-bold text-rose-700 dark:text-rose-400">
        {title}
      </h3>
      <p className="mb-5 max-w-md text-xs text-rose-600/80 dark:text-rose-300/80">
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Retry Operation</span>
        </button>
      )}
    </div>
  );
};
