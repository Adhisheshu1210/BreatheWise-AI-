import type { PollutantReading } from '../types/airQuality.ts';

function getPollutantThresholdMeta(ratio: number | null) {
  if (ratio === null) {
    return {
      barClass: 'bg-slate-300',
      textClass: 'text-slate-600',
      statusText: 'Unavailable',
    };
  }
  if (ratio >= 3) {
    return {
      barClass: 'bg-red-600',
      textClass: 'text-red-800',
      statusText: `High (${ratio.toFixed(1)}× WHO)`,
    };
  }
  if (ratio > 1) {
    return {
      barClass: 'bg-amber-600',
      textClass: 'text-amber-800',
      statusText: `Elevated (${ratio.toFixed(1)}× WHO)`,
    };
  }
  return {
    barClass: 'bg-teal-600',
    textClass: 'text-teal-800',
    statusText: 'Within WHO guide',
  };
}

interface PollutantBreakdownSectionProps {
  pollutants: PollutantReading[];
  attribution: string;
}

export function PollutantBreakdownSection({
  pollutants,
  attribution,
}: PollutantBreakdownSectionProps) {
  return (
    <section
      className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6"
      aria-labelledby="pollutants-heading"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-100">
        <div>
          <h2 id="pollutants-heading" className="text-base font-semibold text-slate-900">
            Pollutant Breakdown & WHO Benchmarks
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Measured concentrations vs. WHO air quality guideline benchmarks
          </p>
        </div>
        <span className="text-xs text-slate-600 font-medium">{attribution}</span>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border border-slate-200 rounded-xl overflow-hidden bg-slate-50/30">
        {pollutants.map((p, idx) => {
          const ratio = p.benchmarkRatio;
          const barPct = ratio !== null ? Math.min(100, Math.round((ratio / 4) * 100)) : 0;
          const thresholdMeta = getPollutantThresholdMeta(ratio);
          return (
            <div
              key={p.code}
              className={`p-4 bg-white border-slate-200 ${
                idx > 0 ? 'border-t sm:border-t' : ''
              } sm:border-r`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{p.label}</div>
                  <div className="text-xs text-slate-600">{p.fullName}</div>
                </div>
                <div className="text-right">
                  <span className="font-mono tabular-nums text-lg font-bold text-slate-900">
                    {p.value !== null ? p.value : '—'}
                  </span>
                  <span className="text-[11px] text-slate-600 ml-1">{p.unit}</span>
                </div>
              </div>

              <div
                className="mt-3 h-2 w-full bg-slate-100 rounded-full overflow-hidden"
                role="progressbar"
                aria-label={`${p.label} level relative to WHO guideline`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={barPct}
                aria-valuetext={thresholdMeta.statusText}
              >
                <div
                  className={`h-full rounded-full ${thresholdMeta.barClass}`}
                  style={{ width: `${barPct}%` }}
                />
              </div>

              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-slate-600">
                  WHO guide:{' '}
                  <span className="font-mono text-slate-800">
                    {p.whoBenchmark} {p.unit}
                  </span>
                </span>
                <span className={`font-semibold ${thresholdMeta.textClass}`}>
                  {thresholdMeta.statusText}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                {p.plainExplanation}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
