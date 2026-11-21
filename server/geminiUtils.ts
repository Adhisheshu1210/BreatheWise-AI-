export type RecommendationTaskType =
  | 'daily-plan'
  | 'family-protection'
  | 'indoor-care'
  | 'outdoor-activity'
  | 'explain-air'
  | 'sustainability-plan'
  | 'commute-advice'
  | 'budget-home-upgrade';

export const VALID_RECOMMENDATION_TASKS: readonly RecommendationTaskType[] = [
  'daily-plan',
  'family-protection',
  'indoor-care',
  'outdoor-activity',
  'explain-air',
  'sustainability-plan',
  'commute-advice',
  'budget-home-upgrade',
] as const;

export class GeminiServiceError extends Error {
  code:
    | 'API_KEY_MISSING'
    | 'INVALID_API_KEY'
    | 'QUOTA_EXCEEDED'
    | 'AI_INVALID_RESPONSE'
    | 'TIMEOUT'
    | 'BAD_REQUEST'
    | 'UPSTREAM_ERROR';
  status: number;

  constructor(
    code: GeminiServiceError['code'],
    message: string,
    status = 500
  ) {
    super(message);
    this.name = 'GeminiServiceError';
    this.code = code;
    this.status = status;
  }
}

export const MODEL_NAME = 'gemini-3.1-flash-lite';

export const CORE_SYSTEM_SAFETY_INSTRUCTION = `You are BreatheWise AI, a calm, competition-grade, evidence-aware urban environmental health, indoor air care, and sustainable living assistant.

Follow these strict rules without exception:
1. GROUNDEDNESS & ZERO FABRICATION: Only cite measurements, pollutants, AQI values, timestamps, weather, schedules, household groups, home setups, budgets, and sustainability goals explicitly provided in the Verified Context JSON. Never invent live sensor values, external station names, traffic volumes, studies, URLs, or numeric calculations.
2. MISSING DATA TRANSPARENCY: Always inspect the "dataGaps" array in the Verified Context. If live AQI is null, a pollutant is listed in "missingPollutants", the timestamp is aging/stale/unavailable, no city is selected, or "isDemo: true", explicitly acknowledge that exact limitation concisely instead of guessing.
3. DETERMINISTIC MATH SEPARATION: Treat precomputed numbers (AQI, WHO ratios, 24h windows, commute distance/CO2e ranges, sustainability score, INR ₹ budget tier) as authoritative facts. Focus your response on personalized reasoning, practical trade-offs, timing, and actionable next steps.
4. NON-DIAGNOSTIC MEDICAL BOUNDARY: Never diagnose medical conditions, prescribe medication, or claim to prevent medical emergencies. Recommend following a personal clinician's plan for asthma or cardiopulmonary sensitivities.
5. BREVITY & SPECIFICITY: Tailor every point to the user's actual city, reading level, home setup, ₹ budget tier, commute mode, and family needs. Keep guidance crisp, scannable, practical, and non-alarmist.`;

export interface ChatContextInput {
  locationName?: string;
  coordinates?: string;
  isDemo?: boolean;
  dataSource?: string;
  dataTimestampIso?: string | null;
  freshnessStatus?: string;
  freshnessLabel?: string;
  aqiStandard?: string;
  currentAqi?: number | null;
  categoryLabel?: string;
  primaryPollutant?: string | null;
  pollutantsSummary?: string;
  missingPollutants?: string[];
  weatherSummary?: string;
  hourlyWindowSummary?: string;
  lifestyleRole?: string;
  priorities?: string[];
  scheduleSummary?: string;
  householdSummary?: string;
  budgetTier?: string;
  indoorSummary?: string;
  sustainabilitySummary?: string;
  recentExposureSummary?: string;
}

export interface AuditedContext {
  location: string;
  coordinates: string;
  isDemo: boolean;
  dataSource: string;
  dataTimestampIso: string | null;
  freshnessStatus: string;
  freshnessLabel: string;
  aqiStandard: string;
  currentAqi: number | null;
  category: string;
  primaryPollutant: string;
  pollutants: string;
  missingPollutants: string[];
  weather: string;
  hourlyWindowSummary: string;
  lifestyleRole: string;
  priorities: string[];
  schedule: string;
  household: string;
  budgetTier: string;
  indoorEnvironment: string;
  sustainabilityGoals: string;
  recentExposure: string;
  dataGaps: string[];
}

export function sanitizeShortString(value: unknown, maxLen = 500): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, maxLen);
}

export function sanitizeStringArray(value: unknown, maxItems = 8, maxItemLen = 280): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeShortString(item, maxItemLen))
    .filter((s) => s.length > 0)
    .slice(0, maxItems);
}

export function parseJsonObject(text: string | undefined, errMsg: string): Record<string, unknown> {
  try {
    let cleaned = (text ?? '').trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Expected JSON object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new GeminiServiceError('AI_INVALID_RESPONSE', errMsg, 502);
  }
}

export function sanitizePayloadValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return undefined;
  if (typeof value === 'string') return sanitizeShortString(value, 320);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) {
    return value
      .slice(0, 12)
      .map((item) => sanitizePayloadValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
      const safeKey = sanitizeShortString(k, 50);
      if (!safeKey) continue;
      const safeVal = sanitizePayloadValue(v, depth + 1);
      if (safeVal !== undefined) out[safeKey] = safeVal;
    }
    return out;
  }
  return undefined;
}

export function normalizeAndAuditContext(raw?: ChatContextInput): AuditedContext {
  const ctx = raw ?? {};
  const location = sanitizeShortString(ctx.locationName, 120) || 'None selected';
  const coordinates = sanitizeShortString(ctx.coordinates, 60) || 'Unavailable';
  const isDemo = Boolean(ctx.isDemo);
  const dataSource =
    sanitizeShortString(ctx.dataSource, 120) ||
    (isDemo ? 'BreatheWise Demonstration Dataset' : 'Open-Meteo Air Quality');
  const dataTimestampIso = sanitizeShortString(ctx.dataTimestampIso, 60) || null;
  const freshnessStatus = sanitizeShortString(ctx.freshnessStatus, 24) || 'unavailable';
  const freshnessLabel = sanitizeShortString(ctx.freshnessLabel, 80) || 'Timestamp unavailable';
  const aqiStandard = sanitizeShortString(ctx.aqiStandard, 30) || 'US EPA AQI';
  const currentAqi =
    typeof ctx.currentAqi === 'number' && Number.isFinite(ctx.currentAqi)
      ? Math.round(ctx.currentAqi)
      : null;
  const category = sanitizeShortString(ctx.categoryLabel, 60) || 'Unavailable';
  const primaryPollutant = sanitizeShortString(ctx.primaryPollutant, 24) || 'Unavailable';
  const pollutants =
    sanitizeShortString(ctx.pollutantsSummary, 600) || 'No pollutant readings provided';
  const missingPollutants = sanitizeStringArray(ctx.missingPollutants, 8, 24);
  const weather =
    sanitizeShortString(ctx.weatherSummary, 220) || 'Weather measurements unavailable';
  const hourlyWindowSummary =
    sanitizeShortString(ctx.hourlyWindowSummary, 260) || '24-hour trajectory unavailable';
  const lifestyleRole = sanitizeShortString(ctx.lifestyleRole, 40) || 'general';
  const priorities = sanitizeStringArray(ctx.priorities, 6, 80);
  const schedule = sanitizeShortString(ctx.scheduleSummary, 350) || 'Schedule not configured';
  const household = sanitizeShortString(ctx.householdSummary, 350) || 'General adult household';
  const budgetTier = sanitizeShortString(ctx.budgetTier, 30) || '2000';
  const indoorEnvironment =
    sanitizeShortString(ctx.indoorSummary, 420) || 'Home profile not detailed yet';
  const sustainabilityGoals =
    sanitizeShortString(ctx.sustainabilitySummary, 420) ||
    'No active sustainability targets summarized';
  const recentExposure =
    sanitizeShortString(ctx.recentExposureSummary, 300) || 'No exposure logs recorded';

  const dataGaps: string[] = [];
  if (location === 'None selected') {
    dataGaps.push('No monitoring city or coordinates are selected yet.');
  }
  if (isDemo) {
    dataGaps.push(
      'Readings come from a labeled Demonstration Mode scenario, not live sensor feeds.'
    );
  }
  if (currentAqi === null) {
    dataGaps.push('Current AQI index reading is missing/unavailable.');
  }
  if (!dataTimestampIso || freshnessStatus === 'unavailable') {
    dataGaps.push('Environmental reading timestamp is unavailable.');
  } else if (freshnessStatus === 'aging' || freshnessStatus === 'stale') {
    dataGaps.push(
      `Environmental reading is ${freshnessLabel.toLowerCase()} and may not reflect sudden local changes.`
    );
  }
  if (missingPollutants.length > 0) {
    dataGaps.push(`Unavailable pollutant readings: ${missingPollutants.join(', ')}.`);
  }
  if (weather.toLowerCase().includes('unavailable') || weather.includes('n/a')) {
    dataGaps.push(
      'One or more weather parameters (temperature/humidity/wind) are unavailable.'
    );
  }

  return {
    location,
    coordinates,
    isDemo,
    dataSource,
    dataTimestampIso,
    freshnessStatus,
    freshnessLabel,
    aqiStandard,
    currentAqi,
    category,
    primaryPollutant,
    pollutants,
    missingPollutants,
    weather,
    hourlyWindowSummary,
    lifestyleRole,
    priorities,
    schedule,
    household,
    budgetTier,
    indoorEnvironment,
    sustainabilityGoals,
    recentExposure,
    dataGaps,
  };
}
