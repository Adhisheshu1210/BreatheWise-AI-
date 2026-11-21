import type { AirQualitySnapshot, AqiStandard, TrendPoint } from '../types/airQuality.ts';

export type TrendRangeKey = '24h' | '7d' | '30d';
export type TrendMetricKey = 'aqi' | 'pm2_5' | 'pm10';

export interface TrendChartCoord {
  x: number;
  y: number | null;
  val: number | null;
  label: string;
}

export interface TrendChartModel {
  series: TrendPoint[];
  values: Array<number | null>;
  numericValues: number[];
  isIllustrative30d: boolean;
  minVal: number;
  maxVal: number;
  avgVal: number | null;
  yMin: number;
  yMax: number;
  metricLabel: string;
  unitLabel: string;
  coords: TrendChartCoord[];
  pathD: string;
  areaD: string;
}

export const TREND_CHART_DIMENSIONS = {
  chartW: 720,
  chartH: 215,
  padL: 44,
  padR: 16,
  padT: 18,
  padB: 32,
} as const;

export function buildTrendChartModel(params: {
  snapshot: AirQualitySnapshot;
  aqiStandard: AqiStandard;
  range: TrendRangeKey;
  metric: TrendMetricKey;
}): TrendChartModel {
  const { snapshot, aqiStandard, range, metric } = params;
  const series: TrendPoint[] =
    range === '24h'
      ? snapshot.hourly24h
      : range === '7d'
      ? snapshot.daily7d
      : snapshot.sample30dTrend;

  const isIllustrative30d =
    range === '30d' && (!snapshot.historical30dAvailable || snapshot.isDemo);

  const values = series.map((pt) => {
    if (metric === 'pm2_5') return pt.pm2_5;
    if (metric === 'pm10') return pt.pm10;
    return aqiStandard === 'eaqi' ? pt.eaqi : pt.usAqi;
  });

  const numericValues = values.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v)
  );
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

  const { chartW, chartH, padL, padR, padT, padB } = TREND_CHART_DIMENSIONS;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;

  const coords: TrendChartCoord[] = values.map((val, idx) => {
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

  let pathD = '';
  let started = false;
  for (const pt of coords) {
    if (pt.y === null) {
      started = false;
      continue;
    }
    pathD += `${started ? 'L' : 'M'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)} `;
    started = true;
  }
  pathD = pathD.trim();

  let areaD = '';
  const validCoords = coords.filter((c) => c.y !== null);
  if (validCoords.length >= 2 && pathD) {
    const first = validCoords[0];
    const last = validCoords[validCoords.length - 1];
    areaD = `${pathD} L ${last.x.toFixed(1)} ${(padT + innerH).toFixed(1)} L ${first.x.toFixed(
      1
    )} ${(padT + innerH).toFixed(1)} Z`;
  }

  return {
    series,
    values,
    numericValues,
    isIllustrative30d,
    minVal,
    maxVal,
    avgVal,
    yMin,
    yMax,
    metricLabel,
    unitLabel,
    coords,
    pathD,
    areaD,
  };
}
