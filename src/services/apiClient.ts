import type {
  AiContextPayload,
  AiRecommendationTaskType,
  AirQualitySnapshot,
  AqiStandard,
  ExposureLogEntry,
  GridStationPoint,
  IndoorHomeProfile,
  LocationResult,
  SustainabilityGoal,
  UserPreferences,
} from '../types/airQuality.ts';
import {
  calculateSustainabilityScore,
  getActiveAqiValue,
  getAqiCategory,
  summarizeHourlyWindows,
} from '../utils/aqi.ts';

export {
  buildDemoBudgetUpgradeAi,
  buildDemoChatReply,
  buildDemoCommuteAi,
  buildDemoExplainAir,
  buildDemoFamilyPlan,
  buildDemoIndoorCarePlan,
  buildDemoOutdoorActivityAi,
  buildDemoSustainabilityAi,
  normalizeDailyPlanItems,
} from './demoAiGenerators.ts';

export class ApiClientError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
  }
}

const AI_CACHE_TTL_MS = 5 * 60 * 1000;
const AI_CACHE_MAX_ENTRIES = 40;
const aiResponseCache = new Map<string, { expiresAt: number; data: unknown }>();
const aiInflightRequests = new Map<string, Promise<unknown>>();

export function clearAiResponseCache(): void {
  aiResponseCache.clear();
  aiInflightRequests.clear();
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 12000, signal: externalSignal, ...fetchOptions } = options;
  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, { ...fetchOptions, signal: controller.signal });
  } catch (err) {
    if (timedOut) {
      throw new ApiClientError(
        'TIMEOUT',
        'The request timed out before the server responded. Please retry.',
        504
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const rawText = await res.text().catch(() => '');
  let parsed: (T & { error?: string; message?: string }) | null = null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText) as T & { error?: string; message?: string };
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    throw new ApiClientError(
      parsed?.error ?? 'REQUEST_FAILED',
      parsed?.message ?? `Request failed (${res.status})`,
      res.status
    );
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new ApiClientError(
      'INVALID_RESPONSE',
      'Server returned an invalid or empty response.',
      res.status || 502
    );
  }
  return parsed;
}

export async function fetchServerHealth(): Promise<{
  ok: boolean;
  provider: string;
  geminiConfigured: boolean;
}> {
  const res = await fetchWithTimeout('/api/health', { timeoutMs: 8000 });
  return parseJsonResponse(res);
}

export async function searchLocationsApi(
  query: string,
  signal?: AbortSignal
): Promise<LocationResult[]> {
  const res = await fetchWithTimeout(`/api/location/search?q=${encodeURIComponent(query)}`, {
    signal,
    timeoutMs: 12000,
  });
  const data = await parseJsonResponse<{ results?: LocationResult[] }>(res);
  if (!Array.isArray(data.results)) {
    throw new ApiClientError('INVALID_RESPONSE', 'Location search returned an invalid payload.', 502);
  }
  return data.results;
}

export async function fetchAirQualityApi(
  location: Pick<LocationResult, 'latitude' | 'longitude' | 'name' | 'country' | 'admin1'>,
  signal?: AbortSignal,
  timeoutMs = 15000
): Promise<AirQualitySnapshot> {
  const qs = new URLSearchParams({
    lat: String(location.latitude),
    lon: String(location.longitude),
    name: location.name,
    country: location.country,
  });
  if (location.admin1) qs.set('admin1', location.admin1);
  const res = await fetchWithTimeout(`/api/air-quality?${qs.toString()}`, {
    signal,
    timeoutMs,
  });
  const data = await parseJsonResponse<{ snapshot?: AirQualitySnapshot }>(res);
  if (!data.snapshot || typeof data.snapshot !== 'object') {
    throw new ApiClientError(
      'INVALID_RESPONSE',
      'Air quality service returned an incomplete snapshot.',
      502
    );
  }
  return data.snapshot;
}

export async function fetchRegionalGridApi(
  lat: number,
  lon: number,
  name: string,
  signal?: AbortSignal
): Promise<GridStationPoint[]> {
  const qs = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    name,
  });
  const res = await fetchWithTimeout(`/api/air-quality/grid?${qs.toString()}`, {
    signal,
    timeoutMs: 15000,
  });
  const data = await parseJsonResponse<{ stations?: GridStationPoint[] }>(res);
  if (!Array.isArray(data.stations)) {
    throw new ApiClientError(
      'INVALID_RESPONSE',
      'Regional grid service returned an invalid payload.',
      502
    );
  }
  return data.stations;
}

export function buildAiContextPayload(params: {
  snapshot: AirQualitySnapshot | null;
  prefs: UserPreferences;
  indoorProfile?: IndoorHomeProfile;
  sustainabilityGoals?: SustainabilityGoal[];
  exposureLogs?: ExposureLogEntry[];
}): AiContextPayload {
  const { snapshot, prefs, indoorProfile, sustainabilityGoals, exposureLogs } = params;
  const standard: AqiStandard = prefs.aqiStandard;
  const currentAqi = snapshot ? getActiveAqiValue(snapshot, standard) : null;
  const category = getAqiCategory(currentAqi, standard);

  const presentPollutants = snapshot ? snapshot.pollutants.filter((p) => p.value !== null) : [];
  const missingPollutants = snapshot
    ? snapshot.pollutants.filter((p) => p.value === null).map((p) => p.label)
    : ['PM2.5', 'PM10', 'NO₂', 'O₃', 'SO₂', 'CO'];

  const pollutantsSummary =
    presentPollutants.length > 0
      ? presentPollutants
          .map(
            (p) =>
              `${p.label}: ${p.value} ${p.unit}${
                p.benchmarkRatio !== null ? ` (${p.benchmarkRatio}× WHO guide)` : ''
              }`
          )
          .join(', ')
      : 'No pollutant measurements available';

  const weatherSummary = snapshot
    ? `Temp ${snapshot.weather.temperatureC ?? 'n/a'}°C, Humidity ${
        snapshot.weather.humidityPercent ?? 'n/a'
      }%, Wind ${snapshot.weather.windSpeedKmh ?? 'n/a'} km/h`
    : 'Weather unavailable';

  const hourlyWindowSummary = snapshot
    ? summarizeHourlyWindows(snapshot.hourly24h, standard)
    : '24-hour trajectory unavailable';

  const householdSummary =
    prefs.household.length > 0
      ? prefs.household.map((m) => `${m.nickname} (${m.group.replace('_', ' ')})`).join(', ')
      : `General profile (role: ${prefs.lifestyleRole.replace('_', ' ')})`;

  const scheduleSummary = `Wake ${prefs.schedule.wakeTime}, Work ${prefs.schedule.workStart}-${prefs.schedule.workEnd}, Commute: ${prefs.schedule.commuteMode}, Exercise: ${prefs.schedule.preferredExercise}, Bed ${prefs.schedule.bedTime}, Goal: ${prefs.schedule.outdoorGoals || 'General protection'}`;

  const indoorSummary = indoorProfile
    ? `${indoorProfile.homeType.replace('_', ' ')}, ${indoorProfile.rooms} rooms, ~${indoorProfile.sizeSqFt} sq ft, Ventilation: ${indoorProfile.ventilationType.replace('_', ' ')}, Cooking: ${indoorProfile.cookingMethod.replace('_', ' ')}, Filter: ${indoorProfile.filterType.replace('_', ' ')}, Dust: ${indoorProfile.dustLevel}, Humidity: ${indoorProfile.humidityLevel}, Pets: ${indoorProfile.hasPets ? 'yes' : 'no'}, Indoor smoke/incense: ${indoorProfile.indoorSmokeExposure ? 'yes' : 'no'}`
    : 'Home profile not provided';

  const sustainabilitySummary =
    sustainabilityGoals && sustainabilityGoals.length > 0
      ? (() => {
          const score = calculateSustainabilityScore(sustainabilityGoals);
          const topTitles = sustainabilityGoals
            .slice(0, 4)
            .map((g) => `${g.title} (${g.completedCount}/${g.targetCount})`)
            .join('; ');
          return `Score ${score.score} pts (${score.completedTotal}/${score.targetTotal} actions logged). Goals: ${topTitles}`;
        })()
      : 'No sustainability targets summarized';

  const recentExposureSummary =
    exposureLogs && exposureLogs.length > 0
      ? (() => {
          const totalMins = exposureLogs.reduce((s, l) => s + l.durationMinutes, 0);
          const avgAqi = Math.round(
            exposureLogs.reduce((s, l) => s + l.approximateAqi, 0) / exposureLogs.length
          );
          const masked = exposureLogs.filter((l) => l.usedMask).length;
          return `${exposureLogs.length} logged sessions (${totalMins} min total, avg approx AQI ${avgAqi}, mask worn in ${masked} sessions)`;
        })()
      : 'No personal exposure logs recorded yet';

  return {
    locationName: snapshot
      ? `${snapshot.location.name}${snapshot.location.country ? `, ${snapshot.location.country}` : ''}`
      : 'None selected',
    coordinates: snapshot
      ? `${snapshot.location.latitude.toFixed(2)}, ${snapshot.location.longitude.toFixed(2)}`
      : undefined,
    isDemo: snapshot?.isDemo ?? prefs.demoMode,
    dataSource: snapshot?.dataSource ?? (prefs.demoMode ? 'Demonstration Preset' : 'Unavailable'),
    dataTimestampIso: snapshot?.lastUpdatedIso ?? null,
    freshnessStatus: snapshot?.freshnessStatus ?? 'unavailable',
    freshnessLabel: snapshot?.freshnessLabel ?? 'Timestamp unavailable',
    aqiStandard: standard === 'eaqi' ? 'European EAQI' : 'US EPA AQI',
    currentAqi,
    categoryLabel: currentAqi !== null ? category.label : 'Unavailable',
    primaryPollutant: snapshot?.primaryPollutant ?? null,
    pollutantsSummary,
    missingPollutants,
    weatherSummary,
    hourlyWindowSummary,
    lifestyleRole: prefs.lifestyleRole,
    priorities: prefs.priorities,
    scheduleSummary,
    householdSummary,
    budgetTier: indoorProfile?.budgetTier ?? prefs.budgetTier,
    indoorSummary,
    sustainabilitySummary,
    recentExposureSummary,
  };
}

export async function sendChatMessageApi(params: {
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  context: AiContextPayload;
}): Promise<string> {
  const res = await fetchWithTimeout('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    timeoutMs: 50000,
  });
  const data = await parseJsonResponse<{ reply?: unknown }>(res);
  if (typeof data.reply !== 'string' || !data.reply.trim()) {
    throw new ApiClientError('AI_INVALID_RESPONSE', 'AI returned an empty reply.', 502);
  }
  return data.reply;
}

export async function requestStructuredAiApi<T>(params: {
  taskType: AiRecommendationTaskType;
  context: AiContextPayload;
  payload: Record<string, unknown>;
  forceRefresh?: boolean;
}): Promise<T> {
  const cacheKey = JSON.stringify({
    taskType: params.taskType,
    context: params.context,
    payload: params.payload,
  });

  if (!params.forceRefresh) {
    const cached = aiResponseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T;
    }
    const existing = aiInflightRequests.get(cacheKey);
    if (existing) {
      return existing as Promise<T>;
    }
  }

  const requestPromise = (async () => {
    const res = await fetchWithTimeout('/api/ai/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskType: params.taskType,
        context: params.context,
        payload: params.payload,
      }),
      timeoutMs: 50000,
    });
    const parsed = await parseJsonResponse<{ data?: T }>(res);
    if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
      throw new ApiClientError(
        'AI_INVALID_RESPONSE',
        'AI recommendation response was incomplete.',
        502
      );
    }
    if (aiResponseCache.size >= AI_CACHE_MAX_ENTRIES) {
      const oldestKey = aiResponseCache.keys().next().value;
      if (oldestKey) aiResponseCache.delete(oldestKey);
    }
    aiResponseCache.set(cacheKey, {
      expiresAt: Date.now() + AI_CACHE_TTL_MS,
      data: parsed.data,
    });
    return parsed.data;
  })();

  aiInflightRequests.set(cacheKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    aiInflightRequests.delete(cacheKey);
  }
}
