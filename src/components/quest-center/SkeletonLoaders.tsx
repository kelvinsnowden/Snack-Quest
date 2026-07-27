import React from 'react';

export function CardSkeleton() {
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="h-4 bg-slate-800 rounded w-1/3" />
        <div className="w-8 h-8 bg-slate-800 rounded-xl" />
      </div>
      <div className="h-8 bg-slate-800 rounded w-2/3" />
      <div className="h-3 bg-slate-800 rounded w-1/2" />
    </div>
  );
}

export function QuestCardSkeleton() {
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden animate-pulse">
      <div className="h-40 bg-slate-800 w-full" />
      <div className="p-4 space-y-2">
        <div className="h-5 bg-slate-800 rounded w-3/4" />
        <div className="h-3 bg-slate-800 rounded w-full" />
        <div className="h-3 bg-slate-800 rounded w-2/3" />
        <div className="h-10 bg-slate-800 rounded-xl w-full mt-4" />
      </div>
    </div>
  );
}

export function TimelineSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3 w-full">
            <div className="w-10 h-10 bg-slate-800 rounded-xl shrink-0" />
            <div className="space-y-2 w-full">
              <div className="h-4 bg-slate-800 rounded w-1/2" />
              <div className="h-3 bg-slate-800 rounded w-1/3" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
