import { useEffect, useMemo, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import type { AirQualitySnapshot, AqiStandard, TrendPoint } from '../types/airQuality.ts';

interface TrendChartProps {
  snapshot: AirQualitySnapshot;
  aqiStandard: AqiStandard;
}

type RangeKey = '24h' | '7d' | '30d';
type MetricKey = 'aqi' | 'pm2_5' | 'pm10';

export function TrendChart({ snapshot, aqiStandard }: TrendChartProps) {
  const [range, setRange] = useState<RangeKey>('24h');
  const [metric, setMetric] = useState<MetricKey>('aqi');
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const pointRefs = useRef<Array<SVGRectElement | null>>([]);

  useEffect(() => {
    setActiveIdx(null);
    setFocusedIdx(null);
  }, [snapshot.location.id]);

  const series: TrendPoint[] = useMemo(() => {
    if (range === '24h') return snapshot.hourly24h;
    if (range === '7d') return snapshot.daily7d;
    return snapshot.sample30dTrend;
  }, [range, snapshot]);

  const isIllustrative30d =
    range === '30d' && (!snapshot.historical30dAvailable || snapshot.isDemo);

  const values = useMemo(() => {
    return series.map((pt) => {
      if (metric === 'pm2_5') return pt.pm2_5;
      if (metric === 'pm10') return pt.pm10;
      return aqiStandard === 'eaqi' ? pt.eaqi : pt.usAqi;
    });
  }, [series, metric, aqiStandard]);

  const numericValues = values.filter((v): v is number => typeof v === 'number');
  const minVal = numericValues.length > 0 ? Math.min(...numericValues) : 0;
  const maxVal = numericValues.length > 0 ? Math.max(...numericValues) : 100;
  const avgVal =
    numericValues.length > 0
      ? Math.round(numericValues.reduce((sum, n) => sum + n, 0) / numericValues.length)
      : null;
  const yMin = Math.max(0, Math.floor(minVal * 0.85));
  const yMax = Math.max(yMin + 10, Math.ceil(maxVal * 1.12));

  const metricLabel =
    metric === 'pm2_5'
      ? 'PM2.5 (µg/m³)'
      : metric === 'pm10'
      ? 'PM10 (µg/m³)'
      : aqiStandard === 'eaqi'
      ? 'European EAQI'
      : 'US EPA AQI';

  const unitLabel =
    metric === 'aqi' ? (aqiStandard === 'eaqi' ? 'EAQI' : 'US AQI') : 'µg/m³';

  const chartW = 720;
  const chartH = 215;
  const padL = 44;
  const padR = 16;
  const padT = 18;
  const padB = 32;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;

  const coords = useMemo(() => {
    return values.map((val, idx) => {
      const x =
        series.length <= 1
          ? padL + innerW / 2
          : padL + (idx / (series.length - 1)) * innerW;
      const y =
        val === null
          ? null
          : padT + innerH - ((val - yMin) / (yMax - yMin)) * innerH;
      return { x, y, val, label: series[idx]?.label ?? '' };
    });
  }, [values, series, innerW, innerH, yMin, yMax]);

  const pathD = useMemo(() => {
    let d = '';
    let started = false;
    for (const pt of coords) {
      if (pt.y === null) {
        started = false;
        continue;
      }
      d += `${started ? 'L' : 'M'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)} `;
      started = true;
    }
    return d.trim();
  }, [coords]);

  const areaD = useMemo(() => {
    const valid = coords.filter((c) => c.y !== null);
    if (valid.length < 2) return '';
    const first = valid[0];
    const last = valid[valid.length - 1];
    return `${pathD} L ${last.x.toFixed(1)} ${(padT + innerH).toFixed(1)} L ${first.x.toFixed(
      1
    )} ${(padT + innerH).toFixed(1)} Z`;
  }, [coords, pathD, innerH]);

  const hoveredIdx = activeIdx !== null ? activeIdx : Math.max(0, coords.length - 1);
  const hovered = coords[hoveredIdx];

  const moveSelection = (nextIdx: number) => {
    const bounded = Math.min(coords.length - 1, Math.max(0, nextIdx));
    setActiveIdx(bounded);
    setFocusedIdx(bounded);
    pointRefs.current[bounded]?.focus();
  };

  return (
    <section
      className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6"
      aria-labelledby="trend-chart-heading"
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 id="trend-chart-heading" className="text-lg font-semibold text-slate-900">
            Air Quality Trend
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            {range === '24h'
              ? 'Recent 24-hour trajectory'
              : range === '7d'
              ? '7-day daily average progression'
              : '30-day window'}
            {' · '}
            <span className="font-medium text-slate-800">{metricLabel}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex items-center p-1 bg-slate-100 rounded-lg"
            role="group"
            aria-label="Select pollutant or index metric"
          >
            {(
              [
                ['aqi', 'AQI'],
                ['pm2_5', 'PM2.5'],
                ['pm10', 'PM10'],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                aria-pressed={metric === k}
                onClick={() => setMetric(k)}
                className={`px-3 py-1.5 min-h-[34px] text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  metric === k
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <div
            className="inline-flex items-center p-1 bg-slate-100 rounded-lg"
            role="group"
            aria-label="Select trend timeframe"
          >
            {(
              [
                ['24h', '24 Hours'],
                ['7d', '7 Days'],
                ['30d', '30 Days'],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                aria-pressed={range === k}
                onClick={() => {
                  setRange(k);
                  setActiveIdx(null);
                  setFocusedIdx(null);
                }}
                className={`px-3 py-1.5 min-h-[34px] text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  range === k
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <button
            type="button"
            aria-pressed={showTable}
            onClick={() => setShowTable((v) => !v)}
            className="px-3 py-1.5 min-h-[36px] text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
          >
            {showTable ? 'Chart View' : 'Table View'}
          </button>
        </div>
      </div>

      {isIllustrative30d && (
        <div className="mt-4 flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 text-xs">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-800" aria-hidden="true" />
          <p>
            <span className="font-semibold">Labeled sample 30-day visualization:</span>{' '}
            {snapshot.historical30dNote}
          </p>
        </div>
      )}

      {numericValues.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-600">
          Historical readings for {metricLabel} are not available for this location and timeframe.
        </div>
      ) : (
        <>
          {/* Compact range statistics bar */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-50 border border-slate-200/80 rounded-lg px-3.5 py-2.5">
            <div className="flex flex-wrap items-center gap-4 text-slate-600">
              <span>
                Min:{' '}
                <strong className="font-mono tabular-nums text-slate-900">
                  {Math.round(minVal)}
                </strong>
              </span>
              <span>
                Avg:{' '}
                <strong className="font-mono tabular-nums text-slate-900">
                  {avgVal ?? '—'}
                </strong>
              </span>
              <span>
                Peak:{' '}
                <strong className="font-mono tabular-nums text-slate-900">
                  {Math.round(maxVal)}
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-2 text-slate-700" aria-live="polite">
              <span>
                {activeIdx === null ? 'Latest' : 'Selected'}:{' '}
                <strong className="text-slate-900">{hovered?.label ?? 'Latest'}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums font-semibold text-teal-800">
                {hovered?.val !== null && hovered?.val !== undefined
                  ? `${hovered.val} ${unitLabel}`
                  : 'No reading'}
              </span>
            </div>
          </div>

          {showTable ? (
            <div className="mt-3 overflow-x-auto max-h-64 border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">
                  {metricLabel} values for {range} timeframe
                </caption>
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th scope="col" className="py-2.5 px-3 font-semibold">
                      Period
                    </th>
                    <th scope="col" className="py-2.5 px-3 font-semibold text-right">
                      {metricLabel}
                    </th>
                    <th scope="col" className="py-2.5 px-3 font-semibold text-right">
                      PM2.5 (µg/m³)
                    </th>
                    <th scope="col" className="py-2.5 px-3 font-semibold text-right">
                      PM10 (µg/m³)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {series.map((pt, i) => (
                    <tr key={pt.timestamp + i} className="hover:bg-slate-50">
                      <td className="py-2 px-3 text-slate-800">{pt.label}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-900 font-medium">
                        {values[i] ?? '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700">
                        {pt.pm2_5 ?? '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700">
                        {pt.pm10 ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-3">
              <svg
                viewBox={`0 0 ${chartW} ${chartH}`}
                className="w-full h-52 select-none"
                role="region"
                aria-label={`${metricLabel} interactive trend chart for ${range}. Use Left and Right arrow keys to inspect data points, or switch to Table View.`}
              >
                <defs>
                  <linearGradient id="bwTrendFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#0F172A" stopOpacity="0.14" />
                    <stop offset="100%" stopColor="#0F172A" stopOpacity="0.01" />
                  </linearGradient>
                </defs>

                {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                  const y = padT + innerH * (1 - t);
                  const labelVal = Math.round(yMin + (yMax - yMin) * t);
                  return (
                    <g key={t}>
                      <line
                        x1={padL}
                        x2={chartW - padR}
                        y1={y}
                        y2={y}
                        stroke="#E2E8F0"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={padL - 8}
                        y={y + 3}
                        textAnchor="end"
                        className="fill-slate-600 text-[10px] font-mono"
                      >
                        {labelVal}
                      </text>
                    </g>
                  );
                })}

                {areaD && <path d={areaD} fill="url(#bwTrendFill)" />}
                {pathD && (
                  <path
                    d={pathD}
                    fill="none"
                    stroke="#0F172A"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {hovered && hovered.y !== null && (
                  <line
                    x1={hovered.x}
                    x2={hovered.x}
                    y1={padT}
                    y2={padT + innerH}
                    stroke="#0D9488"
                    strokeWidth="1.25"
                    strokeDasharray="3 3"
                  />
                )}

                {coords.map((pt, idx) => {
                  const showXLabel =
                    series.length <= 8 ||
                    idx % Math.ceil(series.length / 6) === 0 ||
                    idx === series.length - 1;
                  const isActive = idx === hoveredIdx;
                  const isFocused = idx === focusedIdx;
                  return (
                    <g key={idx}>
                      {showXLabel && (
                        <text
                          x={pt.x}
                          y={chartH - 8}
                          textAnchor="middle"
                          className="fill-slate-600 text-[10px]"
                        >
                          {pt.label}
                        </text>
                      )}
                      {pt.y !== null && isFocused && (
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={8.5}
                          fill="none"
                          stroke="#0D9488"
                          strokeWidth="2"
                        />
                      )}
                      {pt.y !== null && (
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isActive ? 4.5 : 2.5}
                          fill={isActive ? '#0D9488' : '#0F172A'}
                          stroke="#FFFFFF"
                          strokeWidth="1.5"
                        />
                      )}
                      <rect
                        ref={(el) => {
                          pointRefs.current[idx] = el;
                        }}
                        x={pt.x - innerW / Math.max(2, series.length * 2)}
                        y={padT}
                        width={Math.max(12, innerW / Math.max(1, series.length))}
                        height={innerH}
                        fill="transparent"
                        className="cursor-pointer focus:outline-none"
                        tabIndex={idx === hoveredIdx ? 0 : -1}
                        role="button"
                        aria-label={`${pt.label}: ${
                          pt.val !== null ? `${pt.val} ${unitLabel}` : 'No reading'
                        }`}
                        onMouseEnter={() => setActiveIdx(idx)}
                        onFocus={() => {
                          setActiveIdx(idx);
                          setFocusedIdx(idx);
                        }}
                        onBlur={() => setFocusedIdx(null)}
                        onClick={() => setActiveIdx(idx)}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowRight') {
                            e.preventDefault();
                            moveSelection(idx + 1);
                          } else if (e.key === 'ArrowLeft') {
                            e.preventDefault();
                            moveSelection(idx - 1);
                          } else if (e.key === 'Home') {
                            e.preventDefault();
                            moveSelection(0);
                          } else if (e.key === 'End') {
                            e.preventDefault();
                            moveSelection(coords.length - 1);
                          } else if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setActiveIdx(idx);
                          }
                        }}
                      />
                    </g>
                  );
                })}
              </svg>
              <p className="text-[11px] text-slate-600 mt-1">
                Tip: Hover or focus the chart and use Left/Right arrows to inspect each point, or open Table View for full numeric data.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
