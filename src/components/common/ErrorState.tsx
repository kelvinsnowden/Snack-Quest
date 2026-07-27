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
  onRetry
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-10 text-center bg-rose-500/5 border border-rose-500/20 rounded-xl">
      <AlertTriangle className="h-8 w-8 text-rose-500 mb-3" />
      <h3 className="text-sm font-bold text-rose-700 dark:text-rose-400 mb-1">{title}</h3>
      <p className="text-xs text-rose-600/80 dark:text-rose-300/80 max-w-md mb-5">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Retry Operation</span>
        </button>
      )}
    </div>
  );
};
