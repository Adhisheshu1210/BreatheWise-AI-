import type {
  AirQualitySnapshot,
  AqiCategoryId,
  AqiCategoryMeta,
  AqiStandard,
  DailyPlanItem,
  DailySchedulePrefs,
  EnvironmentalAlert,
  LifestyleRole,
  PollutantCode,
  PollutantReading,
} from '../types/airQuality.ts';

export const US_AQI_CATEGORIES: Record<AqiCategoryId, AqiCategoryMeta> = {
  good: {
    id: 'good',
    label: 'Good',
    shortLabel: 'Good',
    summary: 'Air quality is satisfactory and poses little or no risk for most people.',
    outdoorGuidance: 'Normal outdoor exercise, walking, and children’s play are appropriate.',
    ventilationGuidance: 'Natural cross-ventilation is generally favorable when outdoor conditions remain low.',
    colorHex: '#0D9488',
    bgClass: 'bg-teal-50',
    borderClass: 'border-teal-200',
    textClass: 'text-teal-900',
    badgeTextClass: 'text-teal-700',
  },
  moderate: {
    id: 'moderate',
    label: 'Moderate',
    shortLabel: 'Moderate',
    summary: 'Air quality is acceptable, though unusually sensitive individuals may notice mild irritation.',
    outdoorGuidance: 'Routine outdoor activities are fine for most people; sensitive groups should pace intense exertion.',
    ventilationGuidance: 'Ventilate briefly during lower-traffic midday hours; monitor afternoon trends.',
    colorHex: '#D97706',
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-200',
    textClass: 'text-amber-950',
    badgeTextClass: 'text-amber-800',
  },
  sensitive: {
    id: 'sensitive',
    label: 'Unhealthy for Sensitive Groups',
    shortLabel: 'Sensitive Alert',
    summary: 'Children, older adults, and people with respiratory or heart sensitivities may experience effects.',
    outdoorGuidance: 'Shorten prolonged or strenuous outdoor workouts; choose quieter streets away from heavy traffic.',
    ventilationGuidance: 'Keep roadside windows closed during peak traffic; run indoor filtration if available.',
    colorHex: '#EA580C',
    bgClass: 'bg-orange-50',
    borderClass: 'border-orange-200',
    textClass: 'text-orange-950',
    badgeTextClass: 'text-orange-800',
  },
  poor: {
    id: 'poor',
    label: 'Poor / Unhealthy',
    shortLabel: 'Poor',
    summary: 'Everyone may begin to experience discomfort during sustained outdoor exertion.',
    outdoorGuidance: 'Move vigorous exercise indoors and shorten non-essential outdoor stays.',
    ventilationGuidance: 'Keep exterior windows closed; use exhaust fans only briefly when cooking and rely on indoor recirculation/HEPA if available.',
    colorHex: '#DC2626',
    bgClass: 'bg-red-50',
    borderClass: 'border-red-200',
    textClass: 'text-red-950',
    badgeTextClass: 'text-red-700',
  },
  very_poor: {
    id: 'very_poor',
    label: 'Very Poor',
    shortLabel: 'Very Poor',
    summary: 'Health alert: everyone faces higher risk of airway irritation and reduced comfort outdoors.',
    outdoorGuidance: 'Avoid outdoor workouts and prolonged outdoor exposure; consider a well-fitted N95/FFP2 respirator for essential trips.',
    ventilationGuidance: 'Seal window drafts, avoid outdoor air intake during spikes, and keep indoor particle sources (incense, frying) to a minimum.',
    colorHex: '#B91C1C',
    bgClass: 'bg-red-50',
    borderClass: 'border-red-300',
    textClass: 'text-red-950',
    badgeTextClass: 'text-red-800',
  },
  severe: {
    id: 'severe',
    label: 'Severe Smog',
    shortLabel: 'Severe',
    summary: 'Severe air pollution episode. Prioritize staying in cleaner indoor spaces and following local public advisories.',
    outdoorGuidance: 'Postpone outdoor exercise and non-essential travel. Wear a well-fitted N95/FFP2 mask if you must step out.',
    ventilationGuidance: 'Keep all windows and exterior doors closed. Run air purification continuously if available and follow local official guidance.',
    colorHex: '#7F1D1D',
    bgClass: 'bg-rose-50',
    borderClass: 'border-rose-300',
    textClass: 'text-rose-950',
    badgeTextClass: 'text-rose-900',
  },
};

export function getCategoryFromUsAqi(aqi: number | null): AqiCategoryMeta {
  if (aqi === null || !Number.isFinite(aqi) || aqi < 0) {
    return US_AQI_CATEGORIES.moderate;
  }
  if (aqi <= 50) return US_AQI_CATEGORIES.good;
  if (aqi <= 100) return US_AQI_CATEGORIES.moderate;
  if (aqi <= 150) return US_AQI_CATEGORIES.sensitive;
  if (aqi <= 200) return US_AQI_CATEGORIES.poor;
  if (aqi <= 300) return US_AQI_CATEGORIES.very_poor;
  return US_AQI_CATEGORIES.severe;
}

export function getCategoryFromEaqi(eaqi: number | null): AqiCategoryMeta {
  if (eaqi === null || !Number.isFinite(eaqi) || eaqi < 0) {
    return US_AQI_CATEGORIES.moderate;
  }
  if (eaqi <= 20) return { ...US_AQI_CATEGORIES.good, label: 'Good (EAQI)' };
  if (eaqi <= 40) return { ...US_AQI_CATEGORIES.moderate, label: 'Fair (EAQI)', shortLabel: 'Fair' };
  if (eaqi <= 60) return { ...US_AQI_CATEGORIES.sensitive, label: 'Moderate (EAQI)', shortLabel: 'Moderate' };
  if (eaqi <= 80) return { ...US_AQI_CATEGORIES.poor, label: 'Poor (EAQI)', shortLabel: 'Poor' };
  if (eaqi <= 100) return { ...US_AQI_CATEGORIES.very_poor, label: 'Very Poor (EAQI)', shortLabel: 'Very Poor' };
  return { ...US_AQI_CATEGORIES.severe, label: 'Extremely Poor (EAQI)', shortLabel: 'Extremely Poor' };
}

export function getAqiCategory(
  value: number | null,
  standard: AqiStandard
): AqiCategoryMeta {
  return standard === 'eaqi' ? getCategoryFromEaqi(value) : getCategoryFromUsAqi(value);
}

export function getActiveAqiValue(
  snapshot: Pick<AirQualitySnapshot, 'currentUsAqi' | 'currentEaqi'>,
  standard: AqiStandard
): number | null {
  return standard === 'eaqi' ? snapshot.currentEaqi : snapshot.currentUsAqi;
}

/**
 * Calculates US EPA PM2.5 sub-index for fallback when only PM2.5 concentration is known.
 * Breakpoints follow US EPA 2024 revised PM2.5 AQI table.
 */
export function calculateUsAqiFromPm25(pm25: number): number {
  if (!Number.isFinite(pm25) || pm25 <= 0) return 0;
  const c = Math.max(0, Math.floor(pm25 * 10) / 10);
  const breakpoints: Array<[number, number, number, number]> = [
    [0.0, 9.0, 0, 50],
    [9.1, 35.4, 51, 100],
    [35.5, 55.4, 101, 150],
    [55.5, 125.4, 151, 200],
    [125.5, 225.4, 201, 300],
    [225.5, 325.4, 301, 400],
    [325.5, 500.4, 401, 500],
  ];
  for (const [cLow, cHigh, iLow, iHigh] of breakpoints) {
    if (c <= cHigh) {
      return Math.round(((iHigh - iLow) / (cHigh - cLow)) * (c - cLow) + iLow);
    }
  }
  return 500;
}

export const POLLUTANT_META: Record<
  PollutantCode,
  {
    label: string;
    fullName: string;
    unit: string;
    whoBenchmark: number;
    whoPeriod: string;
    plainExplanation: string;
    actionTip: string;
  }
> = {
  pm2_5: {
    label: 'PM2.5',
    fullName: 'Fine Particulate Matter',
    unit: 'µg/m³',
    whoBenchmark: 15,
    whoPeriod: 'WHO 24h guideline (15 µg/m³)',
    plainExplanation:
      'Microscopic particles smaller than 2.5 microns that travel deep into airways and lungs.',
    actionTip:
      'Reduce strenuous outdoor exertion when elevated; N95/FFP2 masks and HEPA filtration help filter fine particles.',
  },
  pm10: {
    label: 'PM10',
    fullName: 'Coarse Particulate Matter',
    unit: 'µg/m³',
    whoBenchmark: 45,
    whoPeriod: 'WHO 24h guideline (45 µg/m³)',
    plainExplanation:
      'Inhalable dust, road grit, construction debris, and pollen particles up to 10 microns.',
    actionTip:
      'Wet-mop floors rather than dry sweeping and avoid dusty roadside corridors.',
  },
  no2: {
    label: 'NO₂',
    fullName: 'Nitrogen Dioxide',
    unit: 'µg/m³',
    whoBenchmark: 25,
    whoPeriod: 'WHO 24h guideline (25 µg/m³)',
    plainExplanation:
      'Traffic and fuel-combustion gas concentrated near busy roads and during rush hours.',
    actionTip:
      'Walk or cycle on side streets set back from arterial highways and ventilate kitchens when using gas stoves.',
  },
  o3: {
    label: 'O₃',
    fullName: 'Ground-Level Ozone',
    unit: 'µg/m³',
    whoBenchmark: 100,
    whoPeriod: 'WHO 8h peak guideline (100 µg/m³)',
    plainExplanation:
      'Irritating gas formed when sunlight reacts with vehicle and industrial emissions, often peaking in the afternoon.',
    actionTip:
      'Schedule outdoor runs or errands in the early morning before afternoon sunlight boosts ozone formation.',
  },
  so2: {
    label: 'SO₂',
    fullName: 'Sulfur Dioxide',
    unit: 'µg/m³',
    whoBenchmark: 40,
    whoPeriod: 'WHO 24h guideline (40 µg/m³)',
    plainExplanation:
      'Pungent gas emitted from coal/oil combustion and industrial facilities that can irritate airways.',
    actionTip:
      'Limit vigorous outdoor activity if levels spike near industrial corridors.',
  },
  co: {
    label: 'CO',
    fullName: 'Carbon Monoxide',
    unit: 'µg/m³',
    whoBenchmark: 4000,
    whoPeriod: 'WHO 24h guideline (4,000 µg/m³)',
    plainExplanation:
      'Colorless gas from incomplete combustion in vehicles, generators, and unvented fuel burning.',
    actionTip:
      'Never idle vehicles in enclosed garages and ensure gas appliances are properly vented.',
  },
};

export function buildPollutantReadings(
  raw: Partial<Record<PollutantCode, number | null | undefined>>
): PollutantReading[] {
  const order: PollutantCode[] = ['pm2_5', 'pm10', 'no2', 'o3', 'so2', 'co'];
  return order.map((code) => {
    const meta = POLLUTANT_META[code];
    const rawVal = raw[code];
    const value =
      typeof rawVal === 'number' && Number.isFinite(rawVal) && rawVal >= 0
        ? Math.round(rawVal * 10) / 10
        : null;
    const benchmarkRatio =
      value !== null ? Math.round((value / meta.whoBenchmark) * 100) / 100 : null;
    return {
      code,
      label: meta.label,
      fullName: meta.fullName,
      value,
      unit: meta.unit,
      whoBenchmark: meta.whoBenchmark,
      whoPeriod: meta.whoPeriod,
      plainExplanation: meta.plainExplanation,
      actionTip: meta.actionTip,
      benchmarkRatio,
    };
  });
}

export function determinePrimaryPollutant(
  readings: PollutantReading[]
): PollutantCode | null {
  let highest: PollutantReading | null = null;
  for (const reading of readings) {
    if (reading.benchmarkRatio === null) continue;
    if (!highest || reading.benchmarkRatio > (highest.benchmarkRatio ?? 0)) {
      highest = reading;
    }
  }
  return highest ? highest.code : null;
}

export function computeFreshness(
  lastUpdatedIso: string,
  isDemo: boolean,
  nowMs: number = Date.now()
): { status: AirQualitySnapshot['freshnessStatus']; label: string } {
  if (isDemo) {
    return { status: 'demo', label: 'Demonstration dataset (illustrative)' };
  }
  const parsed = Date.parse(lastUpdatedIso);
  if (Number.isNaN(parsed)) {
    return { status: 'aging', label: 'Timestamp unavailable' };
  }
  const diffMinutes = Math.max(0, Math.round((nowMs - parsed) / 60000));
  if (diffMinutes <= 30) {
    return {
      status: 'fresh',
      label: diffMinutes <= 2 ? 'Just updated' : `Updated ${diffMinutes} min ago`,
    };
  }
  if (diffMinutes <= 90) {
    return { status: 'recent', label: `Updated ${diffMinutes} min ago` };
  }
  if (diffMinutes <= 240) {
    const hours = Math.round(diffMinutes / 60);
    return { status: 'aging', label: `Updated ${hours}h ago` };
  }
  const hours = Math.round(diffMinutes / 60);
  return { status: 'stale', label: `Older reading (${hours}h ago)` };
}

export function generateAlertsFromData(params: {
  usAqi: number | null;
  hourly24h: AirQualitySnapshot['hourly24h'];
  windSpeedKmh: number | null;
  isDemo: boolean;
}): EnvironmentalAlert[] {
  const alerts: EnvironmentalAlert[] = [];
  const prefix = params.isDemo ? 'Simulated alert: ' : '';
  const aqi = params.usAqi;

  if (aqi !== null && aqi > 200) {
    alerts.push({
      id: 'alert-severe-aqi',
      severity: 'severe',
      category: 'aqi',
      title: `${prefix}Severe Air Pollution Level (US AQI ${aqi})`,
      message:
        'Fine particle concentrations are high enough to affect everyone during outdoor exertion.',
      recommendedAction:
        'Stay indoors when practical, keep windows closed, postpone outdoor exercise, and use a well-fitted N95/FFP2 mask for essential trips.',
      basedOn: params.isDemo ? 'Demo scenario dataset' : 'Current monitoring reading',
    });
  } else if (aqi !== null && aqi > 150) {
    alerts.push({
      id: 'alert-poor-aqi',
      severity: 'elevated',
      category: 'aqi',
      title: `${prefix}Poor Air Quality (US AQI ${aqi})`,
      message:
        'Outdoor air quality is unhealthy for sustained activity and particularly challenging for children and older adults.',
      recommendedAction:
        'Shift workouts indoors and shorten prolonged outdoor exposure.',
      basedOn: params.isDemo ? 'Demo scenario dataset' : 'Current monitoring reading',
    });
  } else if (aqi !== null && aqi > 100) {
    alerts.push({
      id: 'alert-sensitive-aqi',
      severity: 'warning',
      category: 'activity',
      title: `${prefix}Sensitive Group Advisory (US AQI ${aqi})`,
      message:
        'People with asthma, cardiovascular sensitivity, children, and older adults may experience irritation.',
      recommendedAction:
        'Pace outdoor activity, avoid busy arterial roads, and watch afternoon trends.',
      basedOn: params.isDemo ? 'Demo scenario dataset' : 'Current monitoring reading',
    });
  }

  // Check for rapid PM2.5 surge over last 6 hours
  const validPm25 = params.hourly24h
    .map((p) => p.pm2_5)
    .filter((v): v is number => typeof v === 'number');
  if (validPm25.length >= 6) {
    const latest = validPm25[validPm25.length - 1];
    const earlier = validPm25[validPm25.length - 6];
    if (latest - earlier >= 25 || (earlier > 10 && latest / earlier >= 1.5)) {
      alerts.push({
        id: 'alert-rapid-spike',
        severity: 'elevated',
        category: 'spike',
        title: `${prefix}Rapid PM2.5 Increase Observed`,
        message: `PM2.5 rose from ${earlier.toFixed(1)} to ${latest.toFixed(1)} µg/m³ over recent hours.`,
        recommendedAction:
          'Close roadside windows before peak evening accumulation and switch active commutes to lower-exposure options.',
        basedOn: 'Recent 6-hour trend',
      });
    }
  }

  // Poor ventilation condition when wind is calm AND AQI >= 100
  if (
    params.windSpeedKmh !== null &&
    params.windSpeedKmh < 7 &&
    aqi !== null &&
    aqi >= 100
  ) {
    alerts.push({
      id: 'alert-stagnation',
      severity: 'warning',
      category: 'ventilation',
      title: `${prefix}Low Wind Dispersion (${params.windSpeedKmh.toFixed(1)} km/h)`,
      message:
        'Calm winds reduce pollutant dispersion, allowing winter smog and traffic exhaust to linger near street level.',
      recommendedAction:
        'Keep natural window ventilation limited to brief low-AQI windows and run kitchen exhaust during cooking.',
      basedOn: 'Surface wind + AQI reading',
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: 'alert-nominal',
      severity: 'info',
      category: 'aqi',
      title: `${prefix}Conditions Within Routine Range`,
      message:
        'No severe pollution spikes detected in the current snapshot. Continue checking morning and evening updates.',
      recommendedAction:
        'Favorable window for walking, cycling, or opening windows briefly for fresh indoor air exchange.',
      basedOn: params.isDemo ? 'Demo scenario dataset' : 'Current reading',
    });
  }

  return alerts;
}

/**
 * Deterministic, context-aware daily planner generator used both as a fast initial baseline
 * and as a reliable fallback when AI generation is unavailable or in Demo Mode.
 */
export function buildPersonalizedDailyPlan(params: {
  snapshot: AirQualitySnapshot;
  schedule: DailySchedulePrefs;
  role: LifestyleRole;
  hasSensitiveFamily: boolean;
}): DailyPlanItem[] {
  const aqi = params.snapshot.currentUsAqi ?? 75;
  const cat = getCategoryFromUsAqi(aqi);
  const isSevereOrPoor = cat.id === 'poor' || cat.id === 'very_poor' || cat.id === 'severe';
  const isElevated = isSevereOrPoor || cat.id === 'sensitive';

  // Find lowest AQI hour in 24h series for smart timing guidance
  let bestHourLabel = '1:00 PM';
  let bestHourAqi = aqi;
  for (const pt of params.snapshot.hourly24h) {
    if (pt.usAqi !== null && pt.usAqi < bestHourAqi) {
      bestHourAqi = pt.usAqi;
      bestHourLabel = pt.label;
    }
  }

  const roleNote =
    params.role === 'student'
      ? 'school transit and study break'
      : params.role === 'senior'
      ? 'gentle pacing and low-traffic timing'
      : params.role === 'parent'
      ? 'school drop-off and family outdoor play'
      : params.role === 'outdoor_worker'
      ? 'shift breaks in cleaner indoor spaces'
      : 'daily commute and personal routine';

  const items: DailyPlanItem[] = [
    {
      id: 'plan-morning-check',
      time: params.schedule.wakeTime || '07:00',
      title: 'Morning Air Check & Window Decision',
      category: 'monitoring',
      priority: isElevated ? 'high' : 'medium',
      action: isSevereOrPoor
        ? `Keep windows closed at ${params.schedule.wakeTime} (US AQI ${aqi}, ${cat.label}). Run indoor filtration if available.`
        : `Open windows briefly for 15–20 minutes before morning traffic builds if outdoor air smells fresh.`,
      alternative: 'Use kitchen and bathroom exhaust fans instead of opening street-facing windows.',
      explanation: `Early morning temperature inversions often trap overnight emissions near ground level; checking before opening windows prevents pulling stagnant outdoor air indoors.`,
      completed: false,
      isAiGenerated: false,
    },
    {
      id: 'plan-commute-am',
      time: params.schedule.workStart || '08:30',
      title: `Morning Transit (${params.schedule.commuteMode.replace('_', ' ')})`,
      category: 'commute',
      priority: isElevated ? 'high' : 'low',
      action:
        params.schedule.commuteMode === 'remote'
          ? 'Working remotely lowers personal traffic exposure today—keep your workspace dust-free.'
          : isSevereOrPoor
          ? `Switch from open-air walking/cycling to enclosed transit or carpool for your ${roleNote}. Wear a well-fitted N95/FFP2 mask on outdoor walks.`
          : `Use side streets away from heavy diesel traffic for your ${params.schedule.commuteMode.replace('_', ' ')} commute.`,
      alternative:
        params.schedule.commuteMode === 'private_car'
          ? 'Set car climate control to recirculation mode on congested roads.'
          : 'Carpool or use metro/bus to limit personal breathing rate near exhaust.',
      explanation: `Roadside NO₂ and fine particle concentrations can be noticeably higher along congested arterial corridors during peak commute hours.`,
      completed: false,
      isAiGenerated: false,
    },
    {
      id: 'plan-midday-window',
      time: '13:00',
      title: 'Midday Errands & Ventilation Check',
      category: 'ventilation',
      priority: 'medium',
      action: isSevereOrPoor
        ? `Prefer indoor lunch and keep midday errands brief. Best observed AQI window in recent 24h data was around ${bestHourLabel} (AQI ${bestHourAqi}).`
        : `Take a short walk or handle brief outdoor errands around ${bestHourLabel} when afternoon dispersion is typically stronger.`,
      alternative: 'Prepare lunch indoors with an exhaust hood running to avoid indoor cooking particles.',
      explanation: `Daytime warming often lifts morning inversion layers, though ozone can rise in sunny afternoons—timing short errands carefully balances both.`,
      completed: false,
      isAiGenerated: false,
    },
  ];

  if (params.schedule.preferredExercise !== 'none') {
    const exerciseLabel = params.schedule.preferredExercise.replace('_', ' ');
    items.push({
      id: 'plan-exercise',
      time: '17:30',
      title: isElevated
        ? `Indoor Alternative for ${exerciseLabel}`
        : `Planned ${exerciseLabel} Session`,
      category: 'exercise',
      priority: isElevated ? 'high' : 'medium',
      action: isSevereOrPoor
        ? `Postpone outdoor ${exerciseLabel} (US AQI ${aqi}). Complete a 25–30 minute indoor mobility, yoga, or bodyweight circuit instead.`
        : cat.id === 'moderate' || cat.id === 'sensitive'
        ? `Keep outdoor ${exerciseLabel} moderate and shorter than usual, or move intense intervals indoors.`
        : `Enjoy your planned ${exerciseLabel} outdoors in a park or quieter green corridor.`,
      alternative: '20-minute indoor yoga flow, stationary cycling, or light resistance training.',
      explanation: `Vigorous exercise increases breathing volume several-fold, drawing more airborne particles deeper into the respiratory tract when pollution is elevated.`,
      completed: false,
      isAiGenerated: false,
    });
  }

  if (params.hasSensitiveFamily) {
    items.push({
      id: 'plan-family-evening',
      time: '18:30',
      title: 'Family & Sensitive Member Check-In',
      category: 'family',
      priority: isElevated ? 'high' : 'low',
      action: isElevated
        ? 'Encourage children’s creative play indoors, rinse face/hands after school transit, and keep prescribed relief inhalers accessible per personal medical guidance.'
        : 'Light outdoor family walk in a neighborhood park; stay attentive to any dust or traffic gusts.',
      alternative: 'Indoor reading, board games, or gentle stretching together in a clean bedroom or living space.',
      explanation: `Children breathe faster per kilogram of body weight than adults, and older adults or people with respiratory conditions are more sensitive to fine particulate irritation.`,
      completed: false,
      isAiGenerated: false,
    });
  }

  items.push({
    id: 'plan-evening-winddown',
    time: params.schedule.bedTime || '22:00',
    title: 'Evening Cooking & Sleep Environment Prep',
    category: 'indoor',
    priority: isElevated ? 'high' : 'medium',
    action:
      'Wet-wipe bedroom surfaces if dusty, avoid burning candles or incense, and run an air purifier (if owned) in the sleeping area 45 minutes before bed.',
    alternative: 'Place a damp towel or draft stopper under exterior door gaps during winter smog nights.',
    explanation: `Spending 7–8 sleeping hours in a lower-particle bedroom reduces cumulative overnight respiratory irritation.`,
    completed: false,
    isAiGenerated: false,
  });

  return items;
}

export function formatTemperature(
  tempC: number | null,
  unit: 'C' | 'F'
): string {
  if (tempC === null || !Number.isFinite(tempC)) return '—';
  if (unit === 'F') {
    return `${Math.round((tempC * 9) / 5 + 32)} °F`;
  }
  return `${Math.round(tempC * 10) / 10} °C`;
}

export function calculateSustainabilityScore(
  goals: Array<{ completedCount: number; targetCount: number; pointsPerAction: number }>
): { score: number; completedTotal: number; targetTotal: number } {
  let score = 0;
  let completedTotal = 0;
  let targetTotal = 0;
  for (const g of goals) {
    completedTotal += g.completedCount;
    targetTotal += g.targetCount;
    score += g.completedCount * g.pointsPerAction;
  }
  return { score, completedTotal, targetTotal };
}

export function isWithinQuietHours(
  quietStart: string,
  quietEnd: string,
  now: Date = new Date()
): boolean {
  const parseMinutes = (hhmm: string): number | null => {
    const match = /^(\d{1,2}):(\d{2})$/.exec((hhmm || '').trim());
    if (!match) return null;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
  };
  const start = parseMinutes(quietStart);
  const end = parseMinutes(quietEnd);
  if (start === null || end === null || start === end) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  if (start < end) {
    return current >= start && current < end;
  }
  return current >= start || current < end;
}

export function summarizeHourlyWindows(
  hourly24h: AirQualitySnapshot['hourly24h'],
  standard: AqiStandard
): string {
  const points = hourly24h
    .map((pt) => ({
      label: pt.label,
      val: standard === 'eaqi' ? pt.eaqi : pt.usAqi,
    }))
    .filter((pt): pt is { label: string; val: number } => typeof pt.val === 'number' && Number.isFinite(pt.val));

  if (points.length === 0) {
    return '24-hour trajectory data is unavailable for this location.';
  }

  let minPt = points[0];
  let maxPt = points[0];
  for (const pt of points) {
    if (pt.val < minPt.val) minPt = pt;
    if (pt.val > maxPt.val) maxPt = pt;
  }

  const unitLabel = standard === 'eaqi' ? 'EAQI' : 'US AQI';
  let trendNote = 'steady overall';
  if (points.length >= 6) {
    const latest = points[points.length - 1].val;
    const sixAgo = points[points.length - 6].val;
    const diff = latest - sixAgo;
    if (diff >= 15) trendNote = `rising (+${Math.round(diff)} over recent 6h)`;
    else if (diff <= -15) trendNote = `improving (${Math.round(diff)} over recent 6h)`;
  }

  return `Lowest 24h reading: ${minPt.label} (${minPt.val} ${unitLabel}); Peak 24h reading: ${maxPt.label} (${maxPt.val} ${unitLabel}); Recent trajectory: ${trendNote}.`;
}

