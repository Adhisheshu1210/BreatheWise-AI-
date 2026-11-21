import { describe, expect, it } from 'vitest';
import {
  normalizeOpenMeteoTimestamp,
  parseOpenMeteoTrends,
} from '../server/airQualityProvider.ts';
import { DEMO_SCENARIOS } from '../src/data/demoData.ts';
import type { AirQualitySnapshot, DailyPlanItem, ExposureLogEntry } from '../src/types/airQuality.ts';
import {
  calculateEstimatedCo2Range,
  getSwappedPlanItem,
  normalizePlanCategory,
  normalizePlanPriority,
} from '../src/utils/aqi.ts';
import {
  calculateCommuteComparison,
  getCommuteTimingAdvice,
} from '../src/utils/commute.ts';
import {
  classifyExposureEntry,
  summarizeExposureLogs,
} from '../src/utils/exposure.ts';
import { evaluateInAppNotifications } from '../src/utils/notifications.ts';
import { buildTrendChartModel } from '../src/utils/trendChart.ts';
import { clampNumber, parseOptionValue } from '../src/utils/validation.ts';

describe('Domain Utilities: Commute & Exposure Calculations', () => {
  it('computes commute travel times, rush-hour multipliers, CO2 ranges, and fallback bounds accurately', () => {
    const walkingHigh = calculateCommuteComparison({
      distanceKm: 5,
      mode: 'walking',
      travelTime: 'morning_rush',
      hasSnapshot: true,
      isHighAqi: true,
    });
    expect(walkingHigh.safeDistanceKm).toBe(5);
    expect(walkingHigh.mainRoadTimeMin).toBe(60); // 5 * 12
    expect(walkingHigh.quietStreetTimeMin).toBe(Math.round(60 * 1.12));
    expect(walkingHigh.transitTimeMin).toBe(Math.round(5 * 3.2 + 8));
    expect(walkingHigh.arterialExposure).toContain('High (unfiltered roadside breathing');
    expect(walkingHigh.quietExposure).toContain('ambient PM2.5 remains high');
    expect(walkingHigh.transitExposure).toContain('N95/FFP2');
    expect(walkingHigh.carCo2Range).toEqual([0.8, 1.1]);
    expect(walkingHigh.transitCo2Range).toEqual([0.2, 0.5]); // 5*0.09=0.45 -> 0.5

    const carRush = calculateCommuteComparison({
      distanceKm: 10,
      mode: 'private_car',
      travelTime: 'evening_rush',
      hasSnapshot: true,
      isHighAqi: false,
    });
    expect(carRush.mainRoadTimeMin).toBe(Math.round(10 * 2.8 * 1.25)); // 35 min
    expect(carRush.quietStreetTimeMin).toBe(Math.round(35 * 1.08));

    const cyclingClean = calculateCommuteComparison({
      distanceKm: 10,
      mode: 'cycling',
      travelTime: 'midday',
      hasSnapshot: true,
      isHighAqi: false,
    });
    expect(cyclingClean.mainRoadTimeMin).toBe(40);
    expect(cyclingClean.arterialExposure).toContain('Moderate-Elevated');

    const transitNoSnap = calculateCommuteComparison({
      distanceKm: Number.NaN,
      mode: 'public_transit',
      travelTime: 'midday',
      hasSnapshot: false,
      isHighAqi: false,
    });
    expect(transitNoSnap.safeDistanceKm).toBe(1);
    expect(transitNoSnap.mainRoadTimeMin).toBe(Math.round(1 * 3.2 + 8)); // 11 min
    expect(transitNoSnap.arterialExposure).toContain('Select a city or Demo Mode');

    const outOfRange = calculateCommuteComparison({
      distanceKm: 250,
      mode: 'carpool',
      travelTime: 'night',
      hasSnapshot: false,
      isHighAqi: false,
    });
    expect(outOfRange.safeDistanceKm).toBe(1);
  });

  it('produces context-aware commute timing advice for high AQI, rush hour, and off-peak travel', () => {
    const cleanSnapshot: AirQualitySnapshot = {
      ...DEMO_SCENARIOS[3].snapshot,
      currentUsAqi: 30,
    };
    const highSnapshot: AirQualitySnapshot = {
      ...DEMO_SCENARIOS[0].snapshot,
      currentUsAqi: 210,
    };

    expect(
      getCommuteTimingAdvice({
        isHighAqi: false,
        travelTime: 'midday',
        snapshot: highSnapshot,
      })
    ).toContain('outdoor AQI is above 150');

    expect(
      getCommuteTimingAdvice({
        isHighAqi: false,
        travelTime: 'morning_rush',
        snapshot: cleanSnapshot,
      })
    ).toContain('Rush-hour traffic raises street-level NO₂');

    expect(
      getCommuteTimingAdvice({
        isHighAqi: false,
        travelTime: 'midday',
        snapshot: cleanSnapshot,
      })
    ).toContain('Midday off-peak travel');
  });

  it('summarizes exposure logs, buckets time periods safely, and prioritizes unmasked high-AQI warnings', () => {
    const emptySummary = summarizeExposureLogs([]);
    expect(emptySummary.totalMinutes).toBe(0);
    expect(emptySummary.avgAqi).toBe(0);
    expect(emptySummary.peakPeriod).toBeUndefined();
    expect(emptySummary.recommendation).toContain('quieter side streets');

    const logs: ExposureLogEntry[] = [
      {
        id: '1',
        dateIso: '2026-11-20',
        timeOfDay: '08:15',
        locationName: 'Delhi',
        activity: 'Walk',
        durationMinutes: 30,
        approximateAqi: 185,
        aqiStandard: 'us_aqi',
        transportMode: 'Walking',
        usedMask: false,
        notes: '',
      },
      {
        id: '2',
        dateIso: '2026-11-20',
        timeOfDay: 'invalid', // falls back to 12 -> Midday
        locationName: 'Delhi',
        activity: 'Errand',
        durationMinutes: 45,
        approximateAqi: 90,
        aqiStandard: 'us_aqi',
        transportMode: 'Transit',
        usedMask: true,
        notes: '',
      },
      {
        id: '3',
        dateIso: '2026-11-20',
        timeOfDay: '19:30',
        locationName: 'Delhi',
        activity: 'Commute',
        durationMinutes: 40,
        approximateAqi: 140,
        aqiStandard: 'us_aqi',
        transportMode: 'Transit',
        usedMask: true,
        notes: '',
      },
    ];

    const unmaskedHighSummary = summarizeExposureLogs(logs);
    expect(unmaskedHighSummary.totalMinutes).toBe(115);
    expect(unmaskedHighSummary.highAqiLogs).toHaveLength(1);
    expect(unmaskedHighSummary.maskedCount).toBe(2); // total masked across logs
    // Verify highAqiLogs=1, maskedCount=2 means maskedCount >= highAqiLogs.length -> peakPeriod Morning recommendation!
    expect(unmaskedHighSummary.peakPeriod?.[0]).toBe('Morning');
    expect(unmaskedHighSummary.recommendation).toContain('highest logged AQI averages occur in the morning');

    // Now test unmasked high AQI session precedence when maskedCount < highAqiLogs.length
    const unmaskedLogs: ExposureLogEntry[] = [
      { ...logs[0], usedMask: false },
    ];
    const unmaskedWarning = summarizeExposureLogs(unmaskedLogs);
    expect(unmaskedWarning.recommendation).toContain('above AQI 150 without a mask');

    expect(classifyExposureEntry({ durationMinutes: 240, approximateAqi: 210 })).toEqual({
      barWidth: 100,
      barTone: 'bg-red-600',
      riskTag: 'High AQI',
    });
    expect(classifyExposureEntry({ durationMinutes: 60, approximateAqi: 120 })).toEqual({
      barWidth: 50,
      barTone: 'bg-amber-500',
      riskTag: 'Elevated AQI',
    });
    expect(classifyExposureEntry({ durationMinutes: 30, approximateAqi: 45 })).toEqual({
      barWidth: 25,
      barTone: 'bg-teal-600',
      riskTag: 'Moderate/Good AQI',
    });
  });
});

describe('Domain Utilities: Notifications, Trend Chart Model, AQI Helpers & Validation', () => {
  it('evaluates notifications with threshold checks, deduplication, quiet hours, severe override, and max 25 cap', () => {
    const baseSnapshot: AirQualitySnapshot = {
      ...DEMO_SCENARIOS[0].snapshot,
      location: { ...DEMO_SCENARIOS[0].snapshot.location, id: 'city-1', name: 'TestCity' },
      isDemo: false,
      currentUsAqi: 165,
    };
    const dayNoon = new Date('2026-11-20T12:00:00');
    const quietNight = new Date('2026-11-20T23:30:00');

    const prefs = {
      aqiThreshold: 150,
      quietStart: '22:00',
      quietEnd: '06:00',
      enableInAppAlerts: true,
      dailySummary: true,
      indoorTips: true,
    };

    const firstRun = evaluateInAppNotifications({
      snapshot: baseSnapshot,
      notificationPrefs: prefs,
      existing: [],
      now: dayNoon,
    });
    expect(firstRun.map((n) => n.type)).toEqual(['aqi_alert', 'daily_summary', 'indoor']);

    // Running again for same city/day/aqi deduplicates completely
    const secondRun = evaluateInAppNotifications({
      snapshot: baseSnapshot,
      notificationPrefs: prefs,
      existing: firstRun,
      now: dayNoon,
    });
    expect(secondRun).toBe(firstRun);

    // During quiet hours, moderate-high AQI (165 <= 200), summary, and indoor tips are suppressed
    const duringQuiet = evaluateInAppNotifications({
      snapshot: baseSnapshot,
      notificationPrefs: prefs,
      existing: [],
      now: quietNight,
    });
    expect(duringQuiet).toEqual([]);

    // Severe pollution (> 200) overrides quiet hours with a severe alert only
    const severeDuringQuiet = evaluateInAppNotifications({
      snapshot: { ...baseSnapshot, currentUsAqi: 245 },
      notificationPrefs: prefs,
      existing: [],
      now: quietNight,
    });
    expect(severeDuringQuiet).toHaveLength(1);
    expect(severeDuringQuiet[0].severity).toBe('severe');

    // Disabled in-app alerts suppresses aqi_alert even during daytime, and list caps at 25
    const existing25 = Array.from({ length: 25 }, (_, i) => ({
      id: `old-${i}`,
      timestampIso: dayNoon.toISOString(),
      type: 'aqi_alert' as const,
      severity: 'info' as const,
      title: `Old ${i}`,
      body: 'Body',
      locationName: 'OldCity',
      read: true,
    }));
    const capped = evaluateInAppNotifications({
      snapshot: baseSnapshot,
      notificationPrefs: { ...prefs, enableInAppAlerts: false },
      existing: existing25,
      now: dayNoon,
    });
    expect(capped).toHaveLength(25);
    expect(capped[0].type).toBe('daily_summary');
    expect(capped[1].type).toBe('indoor');
  });

  it('builds TrendChart models across metrics, ranges, and null gaps without crashing', () => {
    const liveSnap: AirQualitySnapshot = {
      ...DEMO_SCENARIOS[1].snapshot,
      isDemo: false,
      historical30dAvailable: false,
      hourly24h: [
        { timestamp: '2026-11-20T01:00:00Z', label: '1 AM', usAqi: 80, eaqi: 30, pm2_5: 20, pm10: 40, no2: 15, o3: 30 },
        { timestamp: '2026-11-20T02:00:00Z', label: '2 AM', usAqi: null, eaqi: null, pm2_5: null, pm10: null, no2: null, o3: null },
        { timestamp: '2026-11-20T03:00:00Z', label: '3 AM', usAqi: 120, eaqi: 50, pm2_5: 45, pm10: 70, no2: 20, o3: 40 },
        { timestamp: '2026-11-20T04:00:00Z', label: '4 AM', usAqi: 100, eaqi: 42, pm2_5: 35, pm10: 55, no2: 18, o3: 35 },
      ],
    };

    const aqiModel = buildTrendChartModel({
      snapshot: liveSnap,
      aqiStandard: 'us_aqi',
      range: '24h',
      metric: 'aqi',
    });
    expect(aqiModel.isIllustrative30d).toBe(false);
    expect(aqiModel.minVal).toBe(80);
    expect(aqiModel.maxVal).toBe(120);
    expect(aqiModel.avgVal).toBe(100);
    // Null at index 1 breaks path into two separate `M` segments
    expect(aqiModel.pathD.match(/\bM\b/g)).toHaveLength(2);
    expect(aqiModel.areaD).toContain('Z');

    const pm25Model = buildTrendChartModel({
      snapshot: liveSnap,
      aqiStandard: 'eaqi',
      range: '30d',
      metric: 'pm2_5',
    });
    expect(pm25Model.isIllustrative30d).toBe(true);
    expect(pm25Model.metricLabel).toBe('PM2.5 (µg/m³)');

    const allNullSnap: AirQualitySnapshot = {
      ...liveSnap,
      hourly24h: liveSnap.hourly24h.map((p) => ({ ...p, usAqi: null })),
    };
    const emptyModel = buildTrendChartModel({
      snapshot: allNullSnap,
      aqiStandard: 'us_aqi',
      range: '24h',
      metric: 'aqi',
    });
    expect(emptyModel.numericValues).toHaveLength(0);
    expect(emptyModel.avgVal).toBeNull();
    expect(emptyModel.pathD).toBe('');
    expect(emptyModel.areaD).toBe('');
  });

  it('normalizes plan categories/priorities, cycles swap modes cleanly, and computes CO2 ranges & clamped numbers', () => {
    expect(calculateEstimatedCo2Range([
      { completedCount: 2, estimatedCo2RangeKg: [0.3, 0.5] },
      { completedCount: 3, estimatedCo2RangeKg: [0.1, 0.2] },
    ])).toEqual({ totalCo2Min: 0.9, totalCo2Max: 1.6 });

    expect(normalizePlanCategory('indoor_cleaning')).toBe('indoor');
    expect(normalizePlanCategory('Window Ventilation')).toBe('ventilation');
    expect(normalizePlanCategory('Transit Commute')).toBe('commute');
    expect(normalizePlanCategory('Outdoor Exercise')).toBe('exercise');
    expect(normalizePlanCategory('School & Family')).toBe('family');
    expect(normalizePlanCategory('unknown-thing')).toBe('monitoring');

    expect(normalizePlanPriority('HIGH')).toBe('high');
    expect(normalizePlanPriority('invalid')).toBe('medium');

    const initial: DailyPlanItem = {
      id: 'p1',
      time: '08:00',
      title: 'Morning Walk',
      category: 'exercise',
      priority: 'high',
      action: 'Original action',
      alternative: 'Alt indoor stretch',
      explanation: 'Original explanation',
      completed: true,
      isAiGenerated: false,
    };

    const swap1 = getSwappedPlanItem(initial);
    expect(swap1.completed).toBe(false);
    expect(swap1.action).toBe('Alt indoor stretch');

    const swap2 = getSwappedPlanItem(swap1);
    expect(swap2.title).toContain('(Timing Shift)');

    const swap3 = getSwappedPlanItem(swap2);
    expect(swap3.title).toContain('(Protective Mode)');

    expect(parseOptionValue('eaqi', ['us_aqi', 'eaqi'] as const, 'us_aqi')).toBe('eaqi');
    expect(parseOptionValue('bad', ['us_aqi', 'eaqi'] as const, 'us_aqi')).toBe('us_aqi');
    expect(clampNumber(150, 50, 300, 100)).toBe(150);
    expect(clampNumber(20, 50, 300, 100)).toBe(50);
    expect(clampNumber(999, 50, 300, 100)).toBe(300);
    expect(clampNumber(Number.NaN, 50, 300, 100)).toBe(100);
  });

  it('normalizes Open-Meteo timestamps, filters future entries/negative values, and aggregates 7d averages', () => {
    expect(normalizeOpenMeteoTimestamp('2026-11-20T09:00')).toBe(Date.parse('2026-11-20T09:00:00Z'));
    expect(normalizeOpenMeteoTimestamp('2026-11-20T09:00:00Z')).toBe(Date.parse('2026-11-20T09:00:00Z'));
    expect(normalizeOpenMeteoTimestamp('   ')).toBeNull();
    expect(normalizeOpenMeteoTimestamp('not-a-timestamp')).toBeNull();

    const nowMs = Date.parse('2026-11-20T12:00:00Z');
    const trends = parseOpenMeteoTrends(
      {
        time: [
          '2026-11-19T10:00',
          '2026-11-20T10:00',
          '2026-11-20T11:00',
          '2026-11-20T14:00', // > nowMs + 30m: filtered out as forecast
        ],
        us_aqi: [60, 80, 100, 220],
        european_aqi: [25, -4, 40, 90], // negative becomes null
        pm2_5: [15, 25, 35, 99],
        pm10: [30, 40, -1, 150],
      },
      nowMs
    );

    expect(trends.hourly24h).toHaveLength(3);
    expect(trends.hourly24h[1].eaqi).toBeNull();
    expect(trends.hourly24h[2].pm10).toBeNull();

    expect(trends.daily7d).toHaveLength(2);
    expect(trends.daily7d[1].usAqi).toBe(90); // avg of 80 & 100
    expect(trends.daily7d[1].pm2_5).toBe(30); // avg of 25 & 35
    expect(trends.daily7d[1].eaqi).toBe(40); // ignores null at index 1
  });
});
