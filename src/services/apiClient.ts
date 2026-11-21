import type {
  AiContextPayload,
  AiRecommendationTaskType,
  AirQualitySnapshot,
  AqiStandard,
  BudgetHomeUpgradeAiResult,
  CommuteAiResult,
  DailyPlanItem,
  ExplainAirResult,
  ExposureLogEntry,
  FamilyAiResult,
  GridStationPoint,
  IndoorCarePlan,
  IndoorHomeProfile,
  LocationResult,
  OutdoorActivityAiResult,
  SustainabilityAiResult,
  SustainabilityGoal,
  UserPreferences,
} from '../types/airQuality.ts';
import {
  calculateSustainabilityScore,
  getActiveAqiValue,
  getAqiCategory,
  summarizeHourlyWindows,
} from '../utils/aqi.ts';

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
  signal?: AbortSignal
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
    timeoutMs: 15000,
  });
  const data = await parseJsonResponse<{ snapshot?: AirQualitySnapshot }>(res);
  if (!data.snapshot || typeof data.snapshot !== 'object') {
    throw new ApiClientError('INVALID_RESPONSE', 'Air quality service returned an incomplete snapshot.', 502);
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
    throw new ApiClientError('INVALID_RESPONSE', 'Regional grid service returned an invalid payload.', 502);
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

  const presentPollutants = snapshot
    ? snapshot.pollutants.filter((p) => p.value !== null)
    : [];
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

/**
 * Clearly labeled Demo Mode mock AI generators for competition judges when Gemini is unavailable
 * or when Demo Mode is explicitly active.
 */
export function buildDemoChatReply(
  question: string,
  snapshot: AirQualitySnapshot,
  standard: AqiStandard
): string {
  const aqi = getActiveAqiValue(snapshot, standard);
  const cat = getAqiCategory(aqi, standard);
  const pm25 = snapshot.pollutants.find((p) => p.code === 'pm2_5')?.value;
  const windowSummary = summarizeHourlyWindows(snapshot.hourly24h, standard);

  return `**Demo Mode Guidance (Simulated AI Response — Not Live Gemini)**

Based on the **${snapshot.location.name}** demonstration dataset (**${
    standard === 'eaqi' ? 'EAQI' : 'US AQI'
  } ${aqi ?? 'N/A'} — ${cat.label}**${pm25 ? `, PM2.5 ${pm25} µg/m³` : ''}; ${snapshot.freshnessLabel}):

- **Immediate action for today:** ${cat.outdoorGuidance}
- **Indoor air care:** ${cat.ventilationGuidance}
- **Timing window:** ${windowSummary}
- **Regarding your question ("${question.slice(0, 80)}"):** Prioritize lower-exposure indoor alternatives during peak morning and evening accumulation hours, and review the Daily Planner for adjusted timing.

*Note: This response is an illustrative Demo Mode simulation. Connect a Gemini API key in Settings > Secrets and select a Live City for live Gemini reasoning.*`;
}

export function buildDemoIndoorCarePlan(
  profile: IndoorHomeProfile,
  snapshot: AirQualitySnapshot
): IndoorCarePlan {
  const aqi = snapshot.currentUsAqi ?? 120;
  const isPoor = aqi > 150;

  return {
    summary: `Demo indoor plan for a ${profile.sizeSqFt} sq ft ${profile.homeType.replace(
      '_',
      ' '
    )} (${profile.rooms} rooms) with ${profile.cookingMethod.replace('_', ' ')} cooking while outdoor US AQI is ${aqi}.`,
    ventilationVerdict: isPoor
      ? 'Keep exterior windows closed during current elevated outdoor pollution; rely on kitchen exhaust during cooking and internal air circulation/filtration.'
      : 'Brief 15–20 minute cross-ventilation during lower-traffic midday hours is helpful when outdoor air remains moderate or better.',
    rooms: [
      {
        room: 'Bedroom',
        priorityAction: 'Prioritize as your cleanest overnight recovery zone.',
        details:
          'Keep exterior doors/windows sealed on high-AQI nights, wash bedding weekly in warm water, and avoid burning incense or candles.',
      },
      {
        room: 'Living Room',
        priorityAction: 'Control tracked-in road dust and drafts.',
        details:
          'Leave outdoor footwear at the entrance, damp-wipe hard surfaces instead of dry dusting, and seal noticeable window gaps.',
      },
      {
        room: 'Kitchen',
        priorityAction: 'Capture cooking particles at the source.',
        details:
          'Cover pots with lids, turn on the range hood or exhaust fan before heating oil, and keep the kitchen door closed from sleeping areas while frying.',
      },
      {
        room: 'Study Room',
        priorityAction: 'Reduce settled dust near work surfaces.',
        details:
          'Wipe desks with a damp microfiber cloth and position workspace seating away from leaky street-facing window frames.',
      },
      {
        room: "Children's Room",
        priorityAction: 'Keep soft toys and fabrics low-dust.',
        details:
          'Minimize clutter that collects fine dust, vacuum or damp-mop floors regularly, and avoid synthetic spray air fresheners.',
      },
    ],
    checklists: {
      daily: [
        'Run kitchen exhaust while cooking and for 10 minutes afterward.',
        'Leave shoes and dusty outerwear near the entryway.',
        'Check outdoor AQI before opening windows for ventilation.',
      ],
      weekly: [
        'Damp-mop hard floors and wipe window sills with a wet cloth.',
        'Wash bed linens and pillow covers to remove settled dust.',
        'Check air purifier pre-filter mesh for visible lint or dust buildup.',
      ],
      monthly: [
        'Inspect window weather-stripping and door sweeps for smog drafts.',
        'Clean exhaust fan blades and kitchen chimney grease filters.',
        'Review HEPA/carbon filter replacement schedule per manufacturer hours.',
      ],
    },
    budgetRecommendations: [
      {
        tier: '₹0 Budget',
        items: [
          'Keep windows shut during peak morning/evening smog hours.',
          'Wet-mop instead of dry sweeping so settled particles are removed rather than resuspended.',
          'Cook with pot lids on and avoid indoor incense, mosquito coils, or smoking.',
        ],
      },
      {
        tier: 'Under ₹500',
        items: [
          'Microfiber damp-dusting cloths and adhesive foam weather-stripping tape for window gaps.',
          'Door draft stopper / threshold sweep for exterior doors.',
        ],
      },
      {
        tier: 'Under ₹2,000',
        items: [
          'Replacement MERV-13 / HEPA-grade pre-filter sheets or DIY box-fan filter shroud materials where safe.',
          'Basic digital indoor hygrometer to monitor dampness (aim 40–55% relative humidity).',
        ],
      },
      {
        tier: 'Under ₹5,000',
        items: [
          'Compact certified true-HEPA purifier for a single bedroom or nursery (~150–250 sq ft).',
          'Dedicated kitchen exhaust fan upgrade if ventilation is currently absent.',
        ],
      },
      {
        tier: 'Higher-Budget',
        items: [
          'High-CADR True HEPA H13 + activated carbon purifier sized for main living space.',
          'Switch from gas/solid-fuel stoves to electric induction cooking with vented chimney.',
        ],
      },
    ],
    structuredItems: [
      {
        title: 'Source-Control Cooking Ventilation',
        category: 'Kitchen & Particles',
        priority: 'high',
        action: 'Run exhaust hood and cover pans during high-heat cooking.',
        explanation:
          'Frying and gas combustion generate high indoor PM2.5 and NO₂ peaks even when outdoor air is sealed out.',
        estimatedEffort: 'Low (habit change)',
        estimatedCost: '₹0',
        impactDescription: 'Substantially lowers indoor cooking particle spikes.',
        confidenceOrLimitation: 'Evidence-supported indoor hygiene practice; exact reduction varies by fan airflow.',
        suggestedTime: 'During every meal prep',
        sourceType: 'evidence_supported',
      },
      {
        title: 'Clean Bedroom Overnight Zone',
        category: 'Sleep Recovery',
        priority: 'high',
        action: 'Seal bedroom window gaps and damp-wipe surfaces before evening.',
        explanation:
          'Spending 7–8 sleeping hours in lower-dust air helps reduce overnight airway irritation.',
        estimatedEffort: '15 minutes',
        estimatedCost: '₹0 – ₹500',
        impactDescription: 'Reduces overnight indoor particle resuspension.',
        confidenceOrLimitation: 'Does not eliminate outdoor infiltration completely without active HEPA filtration.',
        suggestedTime: '8:30 PM',
        sourceType: 'evidence_supported',
      },
    ],
    disclaimer:
      'Sample Demo Mode indoor guidance. Indoor actions help lower indoor particle accumulation but cannot guarantee complete elimination of all pollutants.',
  };
}

export function buildDemoExplainAir(
  question: string,
  mode: 'beginner' | 'detailed' | 'family',
  snapshot: AirQualitySnapshot
): ExplainAirResult {
  const aqi = snapshot.currentUsAqi ?? 90;
  const pm25 = snapshot.pollutants.find((p) => p.code === 'pm2_5')?.value;

  const toneIntro =
    mode === 'family'
      ? 'For households with children or older relatives: '
      : mode === 'detailed'
      ? 'Technical & meteorological context: '
      : 'In plain words: ';

  return {
    question,
    mode,
    summary: `${toneIntro}${snapshot.location.name} shows US AQI ${aqi} in the current ${
      snapshot.isDemo ? 'demonstration scenario' : 'dataset'
    }${pm25 ? ` with PM2.5 at ${pm25} µg/m³` : ''}.`,
    reasoning:
      'Urban air quality shifts across the day as traffic emissions, residential heating or cooking, and atmospheric mixing interact. Cool, calm mornings or winter nights often create temperature inversions that trap pollutants near street level, while daytime warming and stronger winds help disperse them.',
    practicalActions: [
      aqi > 150
        ? 'Keep vigorous workouts indoors and wear a well-fitted N95/FFP2 mask for essential outdoor errands.'
        : 'Time brisk outdoor walks for midday hours when dispersion is typically better than early rush hour.',
      'Use quieter side streets away from heavy diesel traffic whenever walking or cycling.',
      'Minimize indoor particle sources such as frying without exhaust, incense, or dry sweeping.',
    ],
    uncertaintyDisclosure:
      'Demonstration Mode response: City-level AQI reflects regional modeling or station averages and may differ from hyperlocal street-level conditions near busy intersections or construction sites.',
    followUpQuestions: [
      'When is the lowest-pollution window for a short walk today?',
      'How can I set up a cleaner sleeping room on a low budget?',
      'What precautions matter most for school commutes?',
    ],
    isAiGenerated: false,
    isDemoMock: true,
  };
}

export function buildDemoOutdoorActivityAi(params: {
  activityName: string;
  intensity: string;
  indoorAltTitle: string;
  indoorAltDetails: string;
  riskLevel: 'Low' | 'Moderate' | 'Elevated' | 'High';
  snapshot: AirQualitySnapshot;
  standard: AqiStandard;
}): OutdoorActivityAiResult {
  const aqi = getActiveAqiValue(params.snapshot, params.standard);
  const cat = getAqiCategory(aqi, params.standard);
  const windowSummary = summarizeHourlyWindows(params.snapshot.hourly24h, params.standard);

  return {
    verdict:
      params.riskLevel === 'High'
        ? `Move ${params.activityName.toLowerCase()} indoors today under ${cat.label} conditions in ${params.snapshot.location.name}.`
        : params.riskLevel === 'Elevated'
        ? `Keep ${params.activityName.toLowerCase()} short and lower-intensity, timed away from rush-hour peaks.`
        : `${params.activityName} is generally suitable today with standard roadside caution.`,
    riskAssessment: params.riskLevel,
    bestTimeWindow: windowSummary,
    breathingPrecautions: [
      `Active reading: ${aqi ?? 'Unavailable'} (${cat.label}).`,
      params.riskLevel === 'High' || params.riskLevel === 'Elevated'
        ? 'Avoid heavy sustained mouth-breathing beside busy roads; pause indoors if coughing or irritation starts.'
        : 'Choose parks or residential streets one to two blocks back from heavy traffic.',
    ],
    indoorAlternativePlan: `${params.indoorAltTitle}: ${params.indoorAltDetails}`,
    whyBasedOnReadings: `${params.intensity} exertion increases respiratory intake volume, amplifying exposure when ${params.snapshot.primaryPollutant?.toUpperCase() ?? 'ambient pollution'} is elevated.`,
    dataLimitationNote:
      'Demo Simulation: Reflects demonstration readings rather than live street-level sensors; select a Live City for Gemini-tailored decisions.',
    isAiGenerated: false,
    isDemoMock: true,
  };
}

export function buildDemoSustainabilityAi(params: {
  goals: SustainabilityGoal[];
  snapshot: AirQualitySnapshot | null;
  standard: AqiStandard;
}): SustainabilityAiResult {
  const score = calculateSustainabilityScore(params.goals);
  const aqi = params.snapshot ? getActiveAqiValue(params.snapshot, params.standard) : null;
  const topGoal = params.goals[0];

  return {
    weeklyFocus: `Build consistency on "${topGoal?.title ?? 'Shared transit & cleaner cooking'}" while protecting respiratory safety during elevated outdoor AQI hours.`,
    impactSummary: `You have logged ${score.completedTotal} of ${score.targetTotal} target actions (${score.score} pts) this cycle.`,
    priorityActions: [
      {
        title: 'Shift Short Car Trips Safely',
        whyItMatters: 'Reduces cold-start tailpipe soot and local NO₂ near neighborhoods.',
        practicalStep:
          aqi !== null && aqi > 150
            ? 'Use shared metro/enclosed transit instead of solo driving while outdoor AQI stays elevated.'
            : 'Batch local errands into a single side-street walk or cycle trip.',
        cadence: '2–3 times weekly',
      },
      {
        title: 'Run Kitchen Exhaust & Lid Cooking',
        whyItMatters: 'Cuts indoor combustion particles and cooking energy waste simultaneously.',
        practicalStep: 'Cover pans when boiling and run your range fan until cooking steam clears.',
        cadence: 'Daily',
      },
    ],
    habitSynergies: [
      'Maintaining steady tire pressure and turning off idling engines lowers both fuel spend and sidewalk NO₂.',
      'Scheduling laundry and appliance use off-peak pairs well with clean-home habits.',
    ],
    dataLimitationNote:
      'Demo Simulation: Score is deterministic from logged habits; CO₂e ranges remain illustrative rather than metered.',
    isAiGenerated: false,
    isDemoMock: true,
  };
}

export function buildDemoCommuteAi(params: {
  origin: string;
  destination: string;
  distanceKm: number;
  mode: string;
  travelTime: string;
  snapshot: AirQualitySnapshot | null;
  standard: AqiStandard;
}): CommuteAiResult {
  const aqi = params.snapshot ? getActiveAqiValue(params.snapshot, params.standard) : null;
  const isHigh = (params.snapshot?.currentUsAqi ?? 95) > 150;

  return {
    recommendedOption: isHigh
      ? `Prefer enclosed shared transit or carpool from ${params.origin} to ${params.destination} (${params.distanceKm} km) over unmasked roadside walking/cycling.`
      : `Choose quieter residential side streets or shared transit for your ${params.distanceKm} km ${params.mode.replace('_', ' ')} trip.`,
    timingAdjustment:
      params.travelTime === 'morning_rush' || params.travelTime === 'evening_rush'
        ? 'Shifting departure 30–45 minutes outside peak rush hour typically avoids worst intersection idling queues.'
        : `Off-peak window (${params.travelTime.replace('_', ' ')}) avoids peak commuter idling.`,
    exposureReductionSteps: [
      'Walk or cycle 1–2 blocks parallel to main arterial diesel corridors whenever safe.',
      isHigh
        ? 'Wear a snug N95/FFP2 respirator during outdoor station walks and platform waits.'
        : 'If driving in congestion, toggle cabin recirculation on before entering tunnels or jammed junctions.',
    ],
    gearChecklist: isHigh
      ? ['Snug N95/FFP2 mask', 'Reusable water bottle', 'Eye drops / glasses if dusty']
      : ['Light mask backup for smoky intersections', 'Sun/wind layer'],
    tradeOffSummary:
      'Side-street routes may add ~8–12% travel time in exchange for lower direct tailpipe plume contact.',
    dataLimitationNote:
      'Demo Simulation: Live road traffic, street-level NO₂ sensors, and turn-by-turn routing are not connected.',
    isAiGenerated: false,
    isDemoMock: true,
  };
}

export function buildDemoBudgetUpgradeAi(params: {
  profile: IndoorHomeProfile;
  snapshot: AirQualitySnapshot | null;
}): BudgetHomeUpgradeAiResult {
  const tierMap: Record<IndoorHomeProfile['budgetTier'], string> = {
    '0': '₹0 Budget',
    '500': 'Under ₹500',
    '2000': 'Under ₹2,000',
    '5000': 'Under ₹5,000',
    '5000+': 'Higher-Budget',
  };
  const label = tierMap[params.profile.budgetTier];

  return {
    budgetLabel: label,
    strategySummary: `Prioritized ${label} clean-air steps for your ${params.profile.sizeSqFt} sq ft ${params.profile.homeType.replace('_', ' ')} (${params.profile.cookingMethod.replace('_', ' ')} cooking, ${params.profile.dustLevel} dust) at US AQI ${params.snapshot?.currentUsAqi ?? 'N/A'}.`,
    prioritizedUpgrades: [
      {
        item:
          params.profile.budgetTier === '0'
            ? 'Smog-Window Timing & Wet-Mop Routine'
            : params.profile.budgetTier === '500'
            ? 'Adhesive Foam Window Seals + Door Sweep'
            : params.profile.budgetTier === '2000'
            ? 'Entry Sealing + Bedroom Pre-Filter Maintenance / Box-Fan Filter Kit'
            : 'Dedicated Bedroom True HEPA (H13) Purifier',
        approxCostRange: label,
        reasonForThisHome: `Targets the biggest particle entry and indoor buildup pathways for a ${params.profile.rooms}-room home.`,
        expectedBenefit: 'Lowers indoor dust resuspension and outdoor smog infiltration during sleep hours.',
        limitation: 'Does not remove outdoor pollution completely or replace source kitchen ventilation.',
      },
      {
        item: 'Source Cooking Exhaust Habit',
        approxCostRange: '₹0',
        reasonForThisHome: `Essential with ${params.profile.cookingMethod.replace('_', ' ')} cooking to trap heat/particle plumes.`,
        expectedBenefit: 'Reduces sharp indoor kitchen PM2.5 and NO₂ spikes.',
        limitation: 'Requires consistent fan operation during and 10 min after cooking.',
      },
    ],
    skipForNow: [
      'Avoid uncertified "negative ion" gadgets or small desk purifiers claiming whole-apartment coverage.',
      'Avoid burning scented candles or chemical sprays to mask odors—they add indoor particles/VOCs.',
    ],
    dataLimitationNote:
      'Demo Simulation: Based on your declared home profile rather than in-home particle sensor measurements.',
    isAiGenerated: false,
    isDemoMock: true,
  };
}

export function buildDemoFamilyPlan(params: {
  snapshot: AirQualitySnapshot;
  standard: AqiStandard;
  groups: Array<{ label: string; defaultPrecaution: string; indoorAlt: string }>;
}): FamilyAiResult {
  const aqi = getActiveAqiValue(params.snapshot, params.standard);
  const cat = getAqiCategory(aqi, params.standard);
  const isElevated = cat.id !== 'good';

  return {
    overview: `Demo Simulation Guidance for ${params.snapshot.location.name} (${cat.label}, ${
      params.standard === 'eaqi' ? 'EAQI' : 'US AQI'
    } ${aqi ?? 'N/A'}): Adapted checklists for ${params.groups.length} household group(s). Switch to a Live City for live Gemini tailoring.`,
    morningChecklist: [
      `Check ${params.snapshot.location.name} morning AQI before departure (${cat.label}).`,
      isElevated
        ? 'Keep bedrooms and main living windows sealed during early morning inversion hours.'
        : 'Open windows for 15 minutes of fresh air exchange before peak road traffic.',
      isElevated
        ? 'Pack well-fitted N95/FFP2 masks for essential outdoor commutes and school runs.'
        : 'Plan outdoor walks along shaded interior neighborhood streets.',
    ],
    eveningChecklist: [
      'Run kitchen exhaust while cooking dinner and keep bedroom doors closed.',
      'Leave outdoor footwear near the entryway and damp-wipe dusty hard surfaces.',
      'Keep indoor sleep rooms free from incense, candles, or smoke.',
    ],
    schoolCommuteGuidance: isElevated
      ? 'During elevated AQI, choose enclosed transit or carpools over roadside walking, and coordinate indoor recess alternatives where possible.'
      : 'Conditions allow routine school travel on quieter streets set back from idling buses.',
    groupAdvice: params.groups.map((meta) => ({
      group: meta.label,
      precaution: isElevated
        ? `${meta.defaultPrecaution} (Extra caution under ${cat.label} conditions.)`
        : meta.defaultPrecaution,
      indoorAlternative: meta.indoorAlt,
    })),
    dataLimitationNote:
      'Demo Simulation: Uses demonstration readings rather than live local sensor measurements.',
    isDemoMock: true,
  };
}

export function normalizeDailyPlanItems(
  rawItems: Array<{
    time?: string;
    title?: string;
    category?: string;
    priority?: string;
    action?: string;
    alternative?: string;
    explanation?: string;
  }>
): DailyPlanItem[] {
  const validCategories = new Set([
    'monitoring',
    'commute',
    'exercise',
    'indoor',
    'family',
    'ventilation',
  ]);
  const validPriorities = new Set(['high', 'medium', 'low']);

  const mapCategory = (raw?: unknown): DailyPlanItem['category'] => {
    const s = String(raw ?? '').trim().toLowerCase();
    if (validCategories.has(s)) return s as DailyPlanItem['category'];
    if (s.includes('indoor') || s.includes('home') || s.includes('sleep')) return 'indoor';
    if (s.includes('ventilat')) return 'ventilation';
    if (s.includes('commut') || s.includes('transit') || s.includes('travel')) return 'commute';
    if (s.includes('exercis') || s.includes('fitness') || s.includes('outdoor')) return 'exercise';
    if (s.includes('famil') || s.includes('child') || s.includes('school')) return 'family';
    return 'monitoring';
  };

  const mapPriority = (raw?: unknown): DailyPlanItem['priority'] => {
    const s = String(raw ?? '').trim().toLowerCase();
    return validPriorities.has(s) ? (s as DailyPlanItem['priority']) : 'medium';
  };

  return rawItems.map((item, idx) => ({
    id: `ai-plan-${Date.now()}-${idx}`,
    time: item.time || '09:00',
    title: item.title || 'Air-Aware Activity',
    category: mapCategory(item.category),
    priority: mapPriority(item.priority),
    action: item.action || 'Follow current AQI guidance.',
    alternative: item.alternative || 'Choose an indoor option if air worsens.',
    explanation: item.explanation || 'Tailored to your schedule and current air quality.',
    completed: false,
    isAiGenerated: true,
  }));
}
