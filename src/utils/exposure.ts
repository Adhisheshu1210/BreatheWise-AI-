import type { ExposureLogEntry } from '../types/airQuality.ts';

export const EXPOSURE_TIME_BUCKETS = ['Morning', 'Midday', 'Evening'] as const;
export type ExposureTimeBucket = (typeof EXPOSURE_TIME_BUCKETS)[number];

export interface ExposureBucketStats {
  mins: number;
  aqiSum: number;
  count: number;
}

export interface ExposureWeeklySummary {
  totalMinutes: number;
  highAqiLogs: ExposureLogEntry[];
  maskedCount: number;
  avgAqi: number;
  peakPeriod: [ExposureTimeBucket, ExposureBucketStats] | undefined;
  recommendation: string;
}

export function summarizeExposureLogs(logs: ExposureLogEntry[]): ExposureWeeklySummary {
  const totalMinutes = logs.reduce((sum, l) => sum + l.durationMinutes, 0);
  const highAqiLogs = logs.filter((l) => l.approximateAqi > 150);
  const maskedCount = logs.filter((l) => l.usedMask).length;
  const avgAqi =
    logs.length > 0
      ? Math.round(logs.reduce((s, l) => s + l.approximateAqi, 0) / logs.length)
      : 0;

  const buckets: Record<ExposureTimeBucket, ExposureBucketStats> = {
    Morning: { mins: 0, aqiSum: 0, count: 0 },
    Midday: { mins: 0, aqiSum: 0, count: 0 },
    Evening: { mins: 0, aqiSum: 0, count: 0 },
  };

  for (const l of logs) {
    const rawHour = Number((l.timeOfDay || '12:00').split(':')[0]);
    const hour = Number.isFinite(rawHour) ? rawHour : 12;
    const key: ExposureTimeBucket = hour < 11 ? 'Morning' : hour < 17 ? 'Midday' : 'Evening';
    buckets[key].mins += l.durationMinutes;
    buckets[key].aqiSum += l.approximateAqi;
    buckets[key].count += 1;
  }

  const peakPeriod = EXPOSURE_TIME_BUCKETS
    .map((key): [ExposureTimeBucket, ExposureBucketStats] => [key, buckets[key]])
    .filter(([, b]) => b.count > 0)
    .sort((a, b) => b[1].aqiSum / b[1].count - a[1].aqiSum / a[1].count)[0];

  const recommendation =
    highAqiLogs.length > 0 && maskedCount < highAqiLogs.length
      ? 'You logged outdoor sessions above AQI 150 without a mask. Consider N95/FFP2 protection or shifting workouts indoors on poor-air days.'
      : peakPeriod && peakPeriod[0] !== 'Midday'
      ? `Your highest logged AQI averages occur in the ${peakPeriod[0].toLowerCase()}. Shifting non-essential errands toward midday may lower exposure.`
      : 'Continue pacing outdoor sessions on quieter side streets and monitoring morning AQI updates.';

  return {
    totalMinutes,
    highAqiLogs,
    maskedCount,
    avgAqi,
    peakPeriod,
    recommendation,
  };
}

export function classifyExposureEntry(entry: Pick<ExposureLogEntry, 'durationMinutes' | 'approximateAqi'>): {
  barWidth: number;
  barTone: string;
  riskTag: string;
} {
  const barWidth = Math.min(100, Math.round((entry.durationMinutes / 120) * 100));
  if (entry.approximateAqi > 150) {
    return { barWidth, barTone: 'bg-red-600', riskTag: 'High AQI' };
  }
  if (entry.approximateAqi > 100) {
    return { barWidth, barTone: 'bg-amber-500', riskTag: 'Elevated AQI' };
  }
  return { barWidth, barTone: 'bg-teal-600', riskTag: 'Moderate/Good AQI' };
}
