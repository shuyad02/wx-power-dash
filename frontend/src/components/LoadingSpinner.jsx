import { Wind } from 'lucide-react';

export default function LoadingSpinner({ message = 'Loading data...', size = 'md' }) {
  const sizeClasses = {
    sm: { spinner: 'w-6 h-6', icon: 'w-4 h-4', text: 'text-sm' },
    md: { spinner: 'w-10 h-10', icon: 'w-6 h-6', text: 'text-base' },
    lg: { spinner: 'w-16 h-16', icon: 'w-8 h-8', text: 'text-lg' },
  };

  const classes = sizeClasses[size] || sizeClasses.md;

  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] gap-4">
      <div className="relative">
        <div
          className={`${classes.spinner} rounded-full border-2 border-slate-700 border-t-blue-500 animate-spin`}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <Wind className={`${classes.icon} text-blue-400 animate-pulse`} />
        </div>
      </div>
      <p className={`${classes.text} text-slate-400 font-medium`}>{message}</p>
    </div>
  );
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`bg-[#1e293b] rounded-xl p-5 border border-slate-700/50 animate-pulse ${className}`}>
      <div className="h-4 bg-slate-700 rounded w-2/3 mb-3" />
      <div className="h-8 bg-slate-700 rounded w-1/2 mb-2" />
      <div className="h-3 bg-slate-700 rounded w-1/3" />
    </div>
  );
}

export function SkeletonChart({ className = '' }) {
  return (
    <div className={`bg-[#1e293b] rounded-xl p-5 border border-slate-700/50 animate-pulse ${className}`}>
      <div className="h-4 bg-slate-700 rounded w-1/3 mb-6" />
      <div className="space-y-3">
        <div className="h-3 bg-slate-700 rounded" />
        <div className="h-40 bg-slate-700/50 rounded-lg" />
        <div className="flex justify-between mt-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-3 bg-slate-700 rounded w-12" />
          ))}
        </div>
      </div>
    </div>
  );
}
