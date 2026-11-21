import { AlertCircle, Check, RefreshCw } from 'lucide-react';

interface AiErrorBannerProps {
  error: string;
  onRetry: () => void;
  retryLabel?: string;
  secondaryLabel?: string;
  onSecondaryAction?: () => void;
  className?: string;
}

export function AiErrorBanner({
  error,
  onRetry,
  retryLabel = 'Retry Gemini',
  secondaryLabel,
  onSecondaryAction,
  className = '',
}: AiErrorBannerProps) {
  return (
    <div
      role="alert"
      className={`p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-900 text-xs flex flex-wrap items-center justify-between gap-2 ${className}`}
    >
      <span className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 shrink-0 text-red-700" aria-hidden="true" />
        <span>{error}</span>
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] bg-white border border-red-300 rounded-md font-medium whitespace-nowrap hover:bg-red-100"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          {retryLabel}
        </button>
        {secondaryLabel && onSecondaryAction && (
          <button
            type="button"
            onClick={onSecondaryAction}
            className="px-3 py-1.5 min-h-[36px] bg-white border border-red-300 rounded-md font-medium whitespace-nowrap hover:bg-red-100"
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

interface ChecklistToggleRowProps {
  checked: boolean;
  label: string;
  onToggle: () => void;
}

export function ChecklistToggleRow({ checked, label, onToggle }: ChecklistToggleRowProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className="w-full text-left flex items-start gap-2.5 py-1.5 text-xs text-slate-700 hover:text-slate-950 rounded-md transition-colors"
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
          checked
            ? 'bg-teal-700 border-teal-700 text-white'
            : 'border-slate-400 bg-white'
        }`}
      >
        {checked && <Check className="w-3 h-3" />}
      </span>
      <span className={checked ? 'line-through text-slate-500' : 'text-slate-800'}>{label}</span>
    </button>
  );
}
