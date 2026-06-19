import React from 'react';

export const ChatListSkeleton: React.FC = () => {
  return (
    <div className="space-y-3 p-1 select-none animate-pulse">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="p-3 flex items-center gap-3 rounded-2xl bg-white/5 border border-white/5">
          <div className="w-11 h-11 rounded-xl bg-slate-300 dark:bg-slate-800 shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <div className="flex justify-between items-center">
              <div className="w-24 h-3 bg-slate-300 dark:bg-slate-800 rounded-md" />
              <div className="w-8 h-2 bg-slate-300 dark:bg-slate-800 rounded-md" />
            </div>
            <div className="w-40 h-2.5 bg-slate-200 dark:bg-slate-800/60 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
};

export const MessageStreamSkeleton: React.FC = () => {
  return (
    <div className="space-y-4 p-4 select-none animate-pulse flex flex-col justify-end h-full">
      <div className="flex justify-start">
        <div className="max-w-[60%] rounded-2xl rounded-tl-none px-4 py-3 bg-slate-200 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800/40 w-48 space-y-2">
          <div className="w-32 h-2.5 bg-slate-300 dark:bg-slate-700 rounded-md" />
          <div className="w-16 h-2 bg-slate-300 dark:bg-slate-700/60 rounded-md" />
        </div>
      </div>

      <div className="flex justify-end">
        <div className="max-w-[60%] rounded-2xl rounded-tr-none px-4 py-3 bg-slate-300 dark:bg-indigo-950/40 w-64 space-y-2">
          <div className="w-48 h-2.5 bg-slate-400 dark:bg-indigo-800/60 rounded-md" />
          <div className="w-24 h-2.5 bg-slate-400 dark:bg-indigo-800/60 rounded-md" />
          <div className="w-12 h-2 bg-slate-400 dark:bg-indigo-800/40 rounded-md self-end" />
        </div>
      </div>

      <div className="flex justify-start">
        <div className="max-w-[60%] rounded-2xl rounded-tl-none px-4 py-3 bg-slate-200 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800/40 w-56 space-y-2">
          <div className="w-40 h-2.5 bg-slate-300 dark:bg-slate-700 rounded-md" />
          <div className="w-20 h-2 bg-slate-300 dark:bg-slate-700/60 rounded-md" />
        </div>
      </div>

      <div className="flex justify-end">
        <div className="max-w-[60%] rounded-2xl rounded-tr-none px-4 py-3 bg-slate-300 dark:bg-indigo-950/40 w-40 space-y-2">
          <div className="w-28 h-2.5 bg-slate-400 dark:bg-indigo-800/60 rounded-md" />
          <div className="w-8 h-2 bg-slate-400 dark:bg-indigo-800/40 rounded-md self-end" />
        </div>
      </div>
    </div>
  );
};
