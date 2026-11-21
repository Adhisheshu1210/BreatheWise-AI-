import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react';
import type { AqiCategoryMeta, AqiStandard } from '../types/airQuality.ts';

interface AqiGaugeProps {
  value: number | null;
  standard: AqiStandard;
  category: AqiCategoryMeta;
  primaryPollutantLabel: string | null;
}

export function CategoryStatusIcon({
  categoryId,
  className = 'w-4 h-4',
}: {
  categoryId: AqiCategoryMeta['id'];
  className?: string;
}) {
  if (categoryId === 'good') return <CheckCircle2 className={className} aria-hidden="true" />;
  if (categoryId === 'moderate') return <Info className={className} aria-hidden="true" />;
  if (categoryId === 'sensitive' || categoryId === 'poor') {
    return <AlertTriangle className={className} aria-hidden="true" />;
  }
  return <ShieldAlert className={className} aria-hidden="true" />;
}

export function AqiGauge({
  value,
  standard,
  category,
  primaryPollutantLabel,
}: AqiGaugeProps) {
  const maxScale = standard === 'eaqi' ? 120 : 350;
  const clamped = value !== null ? Math.min(maxScale, Math.max(0, value)) : 0;
  const pct = value !== null ? clamped / maxScale : 0;

  // Semicircle arc geometry (radius 86, center 110, 108)
  const radius = 86;
  const circumference = Math.PI * radius;
  const dashOffset = circumference * (1 - pct);
  const scaleLabel = standard === 'eaqi' ? 'European EAQI' : 'US EPA AQI';

  return (
    <div className="flex flex-col items-center justify-center py-2">
      <div
        className="relative w-56 h-32"
        role="meter"
        aria-label={`${scaleLabel} air quality reading`}
        aria-valuemin={0}
        aria-valuemax={maxScale}
        aria-valuenow={value ?? undefined}
        aria-valuetext={
          value !== null
            ? `${value} on the ${scaleLabel} scale — ${category.label}`
            : `Unavailable on the ${scaleLabel} scale`
        }
      >
        <svg
          viewBox="0 0 220 124"
          className="w-full h-full overflow-visible"
          aria-hidden="true"
        >
          <path
            d="M 24 108 A 86 86 0 0 1 196 108"
            fill="none"
            stroke="#E2E8F0"
            strokeWidth="14"
            strokeLinecap="round"
          />
          {value !== null && (
            <path
              d="M 24 108 A 86 86 0 0 1 196 108"
              fill="none"
              stroke={category.colorHex}
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 400ms cubic-bezier(0.16, 1, 0.3, 1)' }}
            />
          )}
          <text
            x="22"
            y="122"
            className="fill-slate-600 text-[10px] font-mono font-medium"
            textAnchor="middle"
          >
            0
          </text>
          <text
            x="198"
            y="122"
            className="fill-slate-600 text-[10px] font-mono font-medium"
            textAnchor="middle"
          >
            {maxScale}+
          </text>
        </svg>

        <div className="absolute inset-x-0 bottom-1 flex flex-col items-center text-center">
          <span className="text-[11px] font-semibold tracking-wide text-slate-600 uppercase">
            {scaleLabel}
          </span>
          <span className="font-mono tabular-nums text-4xl font-bold tracking-tight text-slate-900 leading-none mt-1">
            {value !== null ? value : '—'}
          </span>
        </div>
      </div>

      <div
        className={`mt-3 flex items-center gap-2 px-3.5 py-1.5 rounded-lg border ${category.bgClass} ${category.borderClass} ${category.textClass}`}
      >
        <CategoryStatusIcon categoryId={category.id} className="w-4 h-4 shrink-0" />
        <span className="text-sm font-semibold whitespace-nowrap">{category.label}</span>
      </div>

      {primaryPollutantLabel && (
        <p className="mt-2 text-xs text-slate-600">
          Primary driver: <span className="font-semibold text-slate-900">{primaryPollutantLabel}</span>
        </p>
      )}
    </div>
  );
}
